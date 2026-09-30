interface Env {
  RAKU_API: Fetcher;
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => {
  return env.RAKU_API.fetch(request);
};
