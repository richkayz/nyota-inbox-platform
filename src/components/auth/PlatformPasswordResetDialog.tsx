import { useState } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mailClient } from "@/lib/api/client";
import { recordAuditEvent } from "@/lib/audit-log";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  defaultEmail?: string;
  supportEmail?: string;
  /** Called with the email + new password after a successful change. */
  onChanged?: (email: string, newPassword: string) => void;
}

/**
 * Super-admin password change, reachable from the sign-in screen.
 * The current password is the proof of ownership, so no session is required.
 * Mailbox users can't reset here — their password lives in Dovecot/Plesk.
 */
export function PlatformPasswordResetDialog({
  open,
  onOpenChange,
  tenantId,
  defaultEmail,
  supportEmail,
  onChanged,
}: Props) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < 10;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit =
    !!email && !!currentPassword && newPassword.length >= 10 && newPassword === confirmPassword && !saving;

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await mailClient.changePlatformAdminPassword({ email, currentPassword, newPassword });
      recordAuditEvent({ tenantId, type: "password.change.success", email });
      toast.success("Password updated", { description: "Sign in with your new password." });
      onChanged?.(email, newPassword);
      reset();
      onOpenChange(false);
    } catch (err) {
      recordAuditEvent({ tenantId, type: "password.change.failure", email });
      toast.error("Could not change password", {
        description: (err as Error).message?.includes("401")
          ? "Current password is incorrect, or this account is not the platform admin."
          : (err as Error).message || "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Change super-admin password
          </DialogTitle>
          <DialogDescription>
            Set a new console password using your current one. Mailbox passwords are managed on your mail
            server — contact {supportEmail ?? "your administrator"} for those.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Admin email</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@company.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-current">Current password</Label>
            <Input
              id="reset-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-new">New password</Label>
            <Input
              id="reset-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-invalid={tooShort}
              required
            />
            <p className={`text-xs ${tooShort ? "text-destructive" : "text-muted-foreground"}`}>
              At least 10 characters.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm">Confirm new password</Label>
            <Input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={mismatch}
              required
            />
            {mismatch && <p className="text-xs text-destructive">Passwords don't match.</p>}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
