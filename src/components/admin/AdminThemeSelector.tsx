import { Palette } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminTheme } from "./AdminThemeProvider";
import { resolveAdminTheme } from "@/lib/admin-theme";

export function AdminThemeSelector() {
  const { theme, setTheme } = useAdminTheme();
  return (
    <Select value={theme} onValueChange={(value) => setTheme(resolveAdminTheme(value))}>
      <SelectTrigger aria-label="Admin theme" title="Admin theme" className="w-40 shrink-0 gap-2 bg-background text-foreground">
        <Palette className="size-4 shrink-0 text-primary" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="darkpan">DarkPan</SelectItem>
        <SelectItem value="legacy">Previous theme</SelectItem>
        <SelectItem value="light">White</SelectItem>
      </SelectContent>
    </Select>
  );
}