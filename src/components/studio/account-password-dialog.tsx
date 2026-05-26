import { FormEvent, useEffect, useState } from "react";
import { Check, Loader2, LockKeyhole, X } from "lucide-react";

type ChangePasswordResult = {
  ok: boolean;
  error?: string;
};

type AccountPasswordDialogProps = {
  open: boolean;
  locale: "en" | "zh";
  changing: boolean;
  t: (key: string) => string;
  onClose: () => void;
  onChangePassword: (input: { currentPassword: string; newPassword: string }) => Promise<ChangePasswordResult>;
  onChanged: (message: string) => void;
};

export function AccountPasswordDialog({
  open,
  locale,
  changing,
  t,
  onClose,
  onChangePassword,
  onChanged
}: AccountPasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    const result = await onChangePassword({ currentPassword, newPassword });
    if (!result.ok) {
      setError(result.error || t("passwordChangeFailed"));
      return;
    }

    onChanged(t("passwordChanged"));
    onClose();
  }

  return (
    <div className="account-dialog" data-testid="account-password-dialog" role="dialog" aria-modal="true" aria-label={t("changePassword")}>
      <button className="account-dialog-scrim" type="button" aria-label={t("closePreview")} onClick={onClose} />
      <form className="account-dialog-card" onSubmit={handleSubmit}>
        <div className="drawer-head">
          <div>
            <p className="section-label">{t("account")}</p>
            <h2>{t("changePassword")}</h2>
          </div>
          <button className="icon-button" type="button" title={t("closePreview")} aria-label={t("closePreview")} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label className="key-field">
          <span>{t("currentPassword")}</span>
          <input
            className="field"
            data-testid="account-current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            autoFocus
          />
        </label>
        <label className="key-field">
          <span>{t("newPassword")}</span>
          <input
            className="field"
            data-testid="account-new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            type="password"
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <label className="key-field">
          <span>{t("confirmPassword")}</span>
          <input
            className="field"
            data-testid="account-confirm-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {error && <div className="alert">{error}</div>}
        <p className="settings-note">
          {locale === "zh"
            ? "修改后会清除其它设备上的登录状态，当前窗口会继续保持登录。"
            : "Changing your password signs out other sessions while keeping this window signed in."}
        </p>
        <button className="primary-button drawer-save" data-testid="account-save-password" type="submit" disabled={changing}>
          {changing ? <Loader2 className="spin" size={17} /> : <LockKeyhole size={17} />}
          {changing ? t("saving") : t("savePassword")}
        </button>
        {!changing && (
          <button className="text-button account-dialog-secondary" type="button" onClick={onClose}>
            <Check size={15} />
            {locale === "zh" ? "暂不修改" : "Not now"}
          </button>
        )}
      </form>
    </div>
  );
}
