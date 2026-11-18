import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Hand server-loaded site settings (incl. the active template) to the browser so the first paint never flips designs.
    dehydrate: () => ({
      queryState: dehydrate(queryClient, {
        shouldDehydrateQuery: (q) => q.queryKey[0] === "site-content" && q.state.status === "success",
      }),
    }),
    hydrate: (d: any) => {
      if (d?.queryState) hydrate(queryClient, d.queryState);
    },
  });

  return router;
};
