import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A minimal in-memory stand-in for the MongoDB operations the workspace modules
 * use, so user scoping is tested without a database.
 */
type Doc = Record<string, unknown> & { _id: ObjectId };
const store = new Map<string, Doc[]>();

const matches = (doc: Doc, filter: Record<string, unknown>) =>
  Object.entries(filter).every(([k, v]) =>
    v instanceof ObjectId ? (doc[k] as ObjectId)?.equals(v) : doc[k] === v
  );

function collection(name: string) {
  const docs = () => store.get(name) ?? store.set(name, []).get(name)!;
  const apply = (doc: Doc, update: Record<string, Record<string, unknown>>, inserting: boolean) => {
    Object.assign(doc, update.$set ?? {});
    if (inserting) Object.assign(doc, update.$setOnInsert ?? {});
    for (const [k, v] of Object.entries(update.$addToSet ?? {})) {
      const arr = (doc[k] as unknown[]) ?? [];
      if (!arr.includes(v)) doc[k] = [...arr, v];
    }
    for (const [k, v] of Object.entries(update.$pull ?? {})) {
      doc[k] = ((doc[k] as unknown[]) ?? []).filter((x) => x !== v);
    }
  };
  return {
    createIndex: async () => "ok",
    find: (filter: Record<string, unknown>) => {
      let out = docs().filter((d) => matches(d, filter));
      const cursor = {
        sort: (spec: Record<string, 1 | -1>) => {
          const [[k, dir]] = Object.entries(spec);
          out = [...out].sort((a, b) => (a[k]! > b[k]! ? dir : a[k]! < b[k]! ? -dir : 0));
          return cursor;
        },
        limit: (n: number) => {
          out = out.slice(0, n);
          return cursor;
        },
        toArray: async () => out.map((d) => ({ ...d })),
      };
      return cursor;
    },
    // Projections are ignored: tests only read fields they set.
    findOne: async (filter: Record<string, unknown>) => {
      const doc = docs().find((d) => matches(d, filter));
      return doc ? { ...doc } : null;
    },
    insertOne: async (doc: Record<string, unknown>) => {
      const _id = new ObjectId();
      docs().push({ ...doc, _id });
      return { insertedId: _id };
    },
    findOneAndUpdate: async (filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => {
      const doc = docs().find((d) => matches(d, filter));
      if (!doc) return null;
      apply(doc, update, false);
      return { ...doc };
    },
    updateOne: async (filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>, opts?: { upsert?: boolean }) => {
      const doc = docs().find((d) => matches(d, filter));
      if (doc) apply(doc, update, false);
      else if (opts?.upsert) {
        const created = { ...filter, _id: new ObjectId() } as Doc;
        apply(created, update, true);
        docs().push(created);
      }
      return {};
    },
    deleteOne: async (filter: Record<string, unknown>) => {
      const i = docs().findIndex((d) => matches(d, filter));
      if (i >= 0) docs().splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
  };
}

vi.mock("@/lib/mongodb", () => ({
  COLLECTIONS: { notes: "notes", tags: "tags", shortlists: "shortlists", profileReports: "profileReports" },
  getDb: async () => ({ collection }),
}));

const notes = await import("@/lib/db/notes");
const tags = await import("@/lib/db/tags");
const lists = await import("@/lib/db/shortlists");
const reports = await import("@/lib/db/profileReports");
const { NoteBodySchema, ShortlistUpdateSchema, TagBodySchema } = await import("@/lib/schemas");

beforeEach(() => store.clear());

describe("notes are private to their author", () => {
  it("lists only your own notes on a developer", async () => {
    await notes.createNote("alice", "dev1", "Alice's note");
    await notes.createNote("bob", "dev1", "Bob's note");
    expect((await notes.listNotes("alice", "dev1")).map((n) => n.body)).toEqual(["Alice's note"]);
  });

  it("another user can't edit or delete your note, even with its id", async () => {
    const note = await notes.createNote("alice", "dev1", "original");
    expect(await notes.updateNote("bob", note.id, "hijacked")).toBeNull();
    expect(await notes.deleteNote("bob", note.id)).toBe(false);
    expect((await notes.listNotes("alice", "dev1"))[0].body).toBe("original");
  });

  it("the author can edit and delete", async () => {
    const note = await notes.createNote("alice", "dev1", "v1");
    expect((await notes.updateNote("alice", note.id, "v2"))?.body).toBe("v2");
    expect(await notes.deleteNote("alice", note.id)).toBe(true);
  });

  it("a malformed id is a miss, not an error", async () => {
    expect(await notes.updateNote("alice", "not-an-id", "x")).toBeNull();
    expect(await notes.deleteNote("alice", "not-an-id")).toBe(false);
  });
});

describe("tags are private and idempotent", () => {
  it("adding twice keeps one tag; others don't see it", async () => {
    await tags.addTag("alice", "dev1", "available-q1");
    await tags.addTag("alice", "dev1", "available-q1");
    expect(await tags.listTags("alice", "dev1")).toEqual(["available-q1"]);
    expect(await tags.listTags("bob", "dev1")).toEqual([]);
    expect(await tags.tagsByDeveloper("bob")).toEqual({});
  });

  it("groups by developer for filtering", async () => {
    await tags.addTag("alice", "dev1", "b");
    await tags.addTag("alice", "dev1", "a");
    await tags.addTag("alice", "dev2", "a");
    expect(await tags.tagsByDeveloper("alice")).toEqual({ dev1: ["a", "b"], dev2: ["a"] });
  });

  it("removing only touches your own tag", async () => {
    await tags.addTag("alice", "dev1", "x");
    expect(await tags.removeTag("bob", "dev1", "x")).toBe(false);
    expect(await tags.listTags("alice", "dev1")).toEqual(["x"]);
  });
});

describe("shortlists are private", () => {
  it("another user can't see, change or delete your list", async () => {
    const list = await lists.createShortlist("alice", { name: "Client A", developerIds: ["dev1"] });
    expect(await lists.listShortlists("bob")).toEqual([]);
    expect(await lists.updateShortlist("bob", list.id, { add: "dev2" })).toBeNull();
    expect(await lists.deleteShortlist("bob", list.id)).toBe(false);
    expect((await lists.listShortlists("alice"))[0].developerIds).toEqual(["dev1"]);
  });

  it("adds without duplicates, removes, and renames", async () => {
    const list = await lists.createShortlist("alice", { name: "L", developerIds: ["a", "a"] });
    expect(list.developerIds).toEqual(["a"]);
    expect((await lists.updateShortlist("alice", list.id, { add: "b" }))?.developerIds).toEqual(["a", "b"]);
    expect((await lists.updateShortlist("alice", list.id, { add: "b" }))?.developerIds).toEqual(["a", "b"]);
    expect((await lists.updateShortlist("alice", list.id, { remove: "a" }))?.developerIds).toEqual(["b"]);
    expect((await lists.updateShortlist("alice", list.id, { name: "Renamed" }))?.name).toBe("Renamed");
  });
});

describe("profile analyzer reports are private", () => {
  const report = (login: string, name = login) => ({
    login,
    developer: {
      id: `gh-${login.toLowerCase()}`,
      name,
      archetype: "backend" as const,
      totalCommits: 1,
      linesAdded: 1,
      linesDeleted: 0,
      repos: [],
      recentCommitMessages: [],
      source: "github" as const,
      githubLogin: login,
    },
    insights: { login, avatarUrl: null } as never,
    summary: null,
    summaryError: null,
  });

  it("another user can't read, list or delete your report, even with its id", async () => {
    const id = await reports.saveProfileReport("alice", report("octo"));
    expect(await reports.getProfileReport("bob", id)).toBeNull();
    expect(await reports.getProfileReportDeveloper("bob", id)).toBeNull();
    expect(await reports.listProfileReports("bob")).toEqual([]);
    expect(await reports.deleteProfileReport("bob", id)).toBe(false);
    expect((await reports.getProfileReport("alice", id))?.login).toBe("octo");
  });

  it("re-analyzing the same login (any case) replaces rather than duplicates", async () => {
    const first = await reports.saveProfileReport("alice", report("Octo", "Old name"));
    const second = await reports.saveProfileReport("alice", report("octo", "New name"));
    expect(second).toBe(first);
    const list = await reports.listProfileReports("alice");
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("New name");
  });

  it("two users analyzing the same person get separate reports", async () => {
    const a = await reports.saveProfileReport("alice", report("octo"));
    const b = await reports.saveProfileReport("bob", report("octo"));
    expect(a).not.toBe(b);
    expect(await reports.deleteProfileReport("alice", a)).toBe(true);
    expect(await reports.getProfileReport("bob", b)).not.toBeNull();
  });

  it("a malformed id is a miss, not an error", async () => {
    expect(await reports.getProfileReport("alice", "nope")).toBeNull();
    expect(await reports.deleteProfileReport("alice", "nope")).toBe(false);
  });
});

describe("workspace body schemas", () => {
  it("normalises tags and rejects odd characters", () => {
    expect(TagBodySchema.parse({ label: "  Available Q1 " }).label).toBe("available-q1");
    expect(TagBodySchema.safeParse({ label: "no/slash" }).error?.issues[0]?.message).toBe(
      "Tags can use letters, numbers, and - _ ."
    );
    expect(TagBodySchema.safeParse({ label: "   " }).success).toBe(false);
  });

  it("requires note text and caps it", () => {
    expect(NoteBodySchema.safeParse({ body: "  " }).error?.issues[0]?.message).toBe("Write something first.");
    expect(NoteBodySchema.safeParse({ body: "x".repeat(5001) }).success).toBe(false);
  });

  it("shortlist updates need exactly one kind of member change", () => {
    expect(ShortlistUpdateSchema.safeParse({}).error?.issues[0]?.message).toBe("Nothing to change.");
    expect(ShortlistUpdateSchema.safeParse({ add: "a", remove: "b" }).error?.issues[0]?.message).toBe(
      "Add or remove one developer at a time."
    );
    expect(ShortlistUpdateSchema.safeParse({ name: "New" }).success).toBe(true);
  });
});
