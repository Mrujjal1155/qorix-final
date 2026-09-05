import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSiteContent } from "@/lib/shop.functions";
import { siteLinks, siteValue, type SiteContent, type SiteLink } from "@/lib/site-content";
import { subscribeSiteUpdate } from "@/lib/site-refresh";

export function useSiteContent() {
  const qc = useQueryClient();
  const { data } = useQuery<SiteContent>({
    queryKey: ["site-content"],
    queryFn: () => getSiteContent(),
    // Live content: no stale window, refresh on focus/reconnect and poll softly
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    return subscribeSiteUpdate(() => {
      qc.invalidateQueries({ queryKey: ["site-content"] });
    });
  }, [qc]);

  const v = (key: string) => siteValue(data, key);
  const links = (key: string): SiteLink[] => siteLinks(data, key);
  return { site: data, v, links };
}
