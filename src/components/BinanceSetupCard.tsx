import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Values = Record<string, string>;

const flag = (v: string | undefined, def = true) =>
  v === undefined || v === "" ? def : v === "1" || v === "true";

export function BinanceSetupCard({
  values,
  setValues,
  onSave,
  apiStatus,
  onSaveKeys,
  savingKeys,
}: {
  values: Values;
  setValues: (v: Values) => void;
  onSave: () => void;
  apiStatus?: { ok: boolean; message: string } | undefined;
  onSaveKeys: (apiKey: string, secretKey: string) => void;
  savingKeys?: boolean;
}) {
  const set = (k: string, v: string) => setValues({ ...values, [k]: v });
  const live = (values["binance_mode"] ?? "live") !== "personal";
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");

  return (
    <Card className="mb-4">
      <CardContent className="space-y-6 pt-6">
        <div className="flex items-center gap-3">
          <span className="rounded bg-[#F0B90B] px-2 py-1 text-xs font-bold text-black">BINANCE</span>
          <h2 className="text-2xl font-bold">Binance Setup</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Status</Label>
            <Select
              value={values["binance_status"] ?? "active"}
              onValueChange={(v) => set("binance_status", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Dollar Rate (1 USD to BDT)</Label>
            <Input
              inputMode="decimal"
              placeholder="130"
              value={values["dollar_rate"] ?? ""}
              onChange={(e) => set("dollar_rate", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>API KEY (For Auto-Verify)</Label>
            <Input
              type="password"
              autoComplete="off"
              placeholder={apiStatus?.ok ? "•••••••••••••••• (saved)" : "Paste your Binance API Key"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Secret KEY (For Auto-Verify)</Label>
            <Input
              type="password"
              autoComplete="off"
              placeholder={apiStatus?.ok ? "•••••••••••••••• (saved)" : "Paste your Binance Secret Key"}
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <Button
              variant="outline"
              disabled={savingKeys || !apiKey.trim() || !secretKey.trim()}
              onClick={() => {
                onSaveKeys(apiKey.trim(), secretKey.trim());
                setApiKey("");
                setSecretKey("");
              }}
            >
              {savingKeys ? "Verifying…" : "Save API Keys"}
            </Button>
          </div>


          <div className="space-y-1 sm:col-span-2">
            <Label>Binance Pay ID (For Pay ID Auto-Verify)</Label>
            <Input
              placeholder="e.g. 123456789"
              value={values["binance_pay"] ?? ""}
              onChange={(e) => set("binance_pay", e.target.value)}
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label>USDT BEP-20 (BSC) wallet address</Label>
            <Input
              className="font-mono"
              placeholder="0x…"
              value={values["usdt_bep20"] ?? ""}
              onChange={(e) => set("usdt_bep20", e.target.value)}
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label>USDT TRC-20 (Tron) wallet address</Label>
            <Input
              className="font-mono"
              placeholder="T…"
              value={values["usdt_trc20"] ?? ""}
              onChange={(e) => set("usdt_trc20", e.target.value)}
            />
          </div>
        </div>

        {apiStatus && (
          <p className={`text-sm ${apiStatus.ok ? "text-primary" : "text-destructive"}`}>
            {apiStatus.ok ? "✅ " : "⚠️ "}
            {apiStatus.message}
          </p>
        )}

        <div className="space-y-2">
          <Label>Checkout Options</Label>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={flag(values["binance_enable_payid"])}
                onCheckedChange={(c) => set("binance_enable_payid", c ? "1" : "0")}
              />
              Enable Binance Pay ID Option
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={flag(values["binance_enable_crypto"])}
                onCheckedChange={(c) => set("binance_enable_crypto", c ? "1" : "0")}
              />
              Enable Crypto Option (TRC20, BEP20, etc.)
            </label>
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <b>How addresses work:</b> in <b>Live Mode</b> the bot first tries to pull a deposit address from Binance
          with your API keys; if Binance blocks the server (HTTP 403 / restricted region) it falls back to the
          wallet addresses you typed above. In <b>Personal Mode</b> only the addresses above are used and every
          payment is confirmed from the transaction ID (auto-match when possible, otherwise admin approval).
          Always fill both wallet addresses so deposits never fail.
        </div>


        <div className="space-y-2">
          <Label>Active Payment Type</Label>
          <div className="flex flex-wrap items-center gap-8">
            <div className="flex items-center gap-2 text-sm">
              <Switch
                checked={!live}
                onCheckedChange={(c) => set("binance_mode", c ? "personal" : "live")}
              />
              Personal Mode (Manual)
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Switch
                checked={live}
                onCheckedChange={(c) => set("binance_mode", c ? "live" : "personal")}
              />
              Live Mode (Auto API)
            </div>
          </div>
        </div>

        <Button onClick={onSave}>Save Setting</Button>
      </CardContent>
    </Card>
  );
}
