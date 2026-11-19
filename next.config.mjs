/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    // GitHub avatars on Profile Analyzer reports. No `search` key: avatar URLs
    // carry `?u=…&v=4`, and an empty `search` would only match none.
    remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com", pathname: "/**" }],
  },

  experimental: {
    /**
     * Client-side Router Cache lifetimes, in seconds.
     *
     * Every route here is dynamic, and Next 15 changed the `dynamic` default to 0
     * — meaning nothing is reused, so switching back to a tab you just visited
     * refetched it from the server every time. 30s makes revisits instant while
     * keeping the data recent enough for a tool people read and act on.
     *
     * The trade-off is staleness: a page cached here will not reflect a change made
     * elsewhere until it expires. Components that mutate data therefore call
     * `router.refresh()` afterwards to invalidate this cache explicitly.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
