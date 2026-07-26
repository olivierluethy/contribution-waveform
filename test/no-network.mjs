// Preload that turns any network attempt into a loud failure. Used to prove
// `build --offline` never calls fetch, since `unshare -rn` is unavailable in
// this sandbox (user namespaces are restricted).
globalThis.fetch = () => {
  throw new Error('NETWORK ACCESS ATTEMPTED during offline build');
};
