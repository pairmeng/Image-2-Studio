import { Check, KeyRound, Trash2, UserPlus } from "lucide-react";
import type { PublicUser } from "@/lib/types";
import { AdminSection, EmptyState, StatusBadge } from "./admin-layout";
import { formatAdminRole } from "./utils/admin-format";

export function AdminUsers({
  users,
  currentUser,
  userSearch,
  newUserEmail,
  newUserPassword,
  newUserRole,
  resetPasswordUserId,
  resetPassword,
  busy,
  onUserSearchChange,
  onNewUserEmailChange,
  onNewUserPasswordChange,
  onNewUserRoleChange,
  onCreateUser,
  onToggleUserDisabled,
  onChangeUserRole,
  onResetPasswordUserIdChange,
  onResetPasswordChange,
  onResetUserPassword,
  onRemoveUser
}: {
  users: PublicUser[];
  currentUser: PublicUser;
  userSearch: string;
  newUserEmail: string;
  newUserPassword: string;
  newUserRole: "ADMIN" | "USER";
  resetPasswordUserId: string;
  resetPassword: string;
  busy: string;
  onUserSearchChange: (value: string) => void;
  onNewUserEmailChange: (value: string) => void;
  onNewUserPasswordChange: (value: string) => void;
  onNewUserRoleChange: (value: "ADMIN" | "USER") => void;
  onCreateUser: () => void;
  onToggleUserDisabled: (user: PublicUser) => void;
  onChangeUserRole: (user: PublicUser, role: "ADMIN" | "USER") => void;
  onResetPasswordUserIdChange: (value: string) => void;
  onResetPasswordChange: (value: string) => void;
  onResetUserPassword: (user: PublicUser) => void;
  onRemoveUser: (user: PublicUser) => void;
}) {
  return (
    <div className="admin-page-stack" data-testid="admin-users">
      <AdminSection title="创建用户" description="新用户可被创建为普通用户或管理员。">
        <div className="admin-form-grid admin-form-grid-compact">
          <label className="admin-field">
            <span>邮箱</span>
            <input type="email" value={newUserEmail} placeholder="user@example.com" onChange={(event) => onNewUserEmailChange(event.target.value)} />
          </label>
          <label className="admin-field">
            <span>初始密码</span>
            <input type="password" value={newUserPassword} placeholder="至少 8 位" onChange={(event) => onNewUserPasswordChange(event.target.value)} />
          </label>
          <label className="admin-field">
            <span>角色</span>
            <select value={newUserRole} onChange={(event) => onNewUserRoleChange(event.target.value === "ADMIN" ? "ADMIN" : "USER")}>
              <option value="USER">普通用户</option>
              <option value="ADMIN">管理员</option>
            </select>
          </label>
          <button className="admin-primary-button admin-form-submit" type="button" onClick={onCreateUser} disabled={Boolean(busy)}>
            <UserPlus size={16} />
            创建用户
          </button>
        </div>
      </AdminSection>

      <AdminSection
        title="用户列表"
        description="支持搜索、禁用/启用、角色切换和密码重置。"
        actions={(
          <label className="admin-search-field">
            <span>搜索</span>
            <input value={userSearch} placeholder="邮箱或角色" onChange={(event) => onUserSearchChange(event.target.value)} />
          </label>
        )}
      >
        {users.length === 0 ? (
          <EmptyState>没有匹配用户。</EmptyState>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-users-table">
              <thead>
                <tr>
                  <th>邮箱</th>
                  <th>状态</th>
                  <th>角色</th>
                  <th>重置密码</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.email}</strong>
                      {user.id === currentUser.id && <small>当前账号</small>}
                    </td>
                    <td>
                      <StatusBadge value={user.disabled ? "disabled" : "enabled"} tone={user.disabled ? "bad" : "good"} />
                    </td>
                    <td>
                      <select
                        className="admin-inline-select"
                        value={user.role}
                        onChange={(event) => onChangeUserRole(user, event.target.value === "ADMIN" ? "ADMIN" : "USER")}
                      >
                        <option value="USER">{formatAdminRole("USER")}</option>
                        <option value="ADMIN">{formatAdminRole("ADMIN")}</option>
                      </select>
                    </td>
                    <td>
                      {resetPasswordUserId === user.id ? (
                        <div className="admin-inline-form">
                          <input type="password" value={resetPassword} placeholder="至少 8 位" onChange={(event) => onResetPasswordChange(event.target.value)} />
                          <button className="admin-icon-button" type="button" title="保存密码" onClick={() => onResetUserPassword(user)}>
                            <Check size={15} />
                          </button>
                        </div>
                      ) : (
                        <button className="admin-icon-text-button" type="button" onClick={() => onResetPasswordUserIdChange(user.id)}>
                          <KeyRound size={15} />
                          重置
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="admin-icon-text-button" type="button" onClick={() => onToggleUserDisabled(user)} disabled={Boolean(busy)}>
                          {user.disabled ? "启用" : "禁用"}
                        </button>
                        <button
                          className="admin-icon-button is-danger"
                          type="button"
                          title="删除用户"
                          onClick={() => onRemoveUser(user)}
                          disabled={user.id === currentUser.id || Boolean(busy)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </div>
  );
}
