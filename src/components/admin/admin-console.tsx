"use client";

import type { PublicUser } from "@/lib/types";
import { AdminAudit } from "./admin-audit";
import { AdminImagePreview } from "./admin-image-preview";
import { AdminImages } from "./admin-images";
import { AdminShell } from "./admin-layout";
import { AdminMonitor } from "./admin-monitor";
import { AdminOverview } from "./admin-overview";
import { AdminProviders } from "./admin-providers";
import { AdminSettings } from "./admin-settings";
import { AdminUsage } from "./admin-usage";
import { AdminUsers } from "./admin-users";
import { useAdminConsole } from "./hooks/use-admin-console";

export function AdminConsole({ currentUser }: { currentUser: PublicUser }) {
  const admin = useAdminConsole(currentUser);

  return (
    <AdminShell
      activeTab={admin.activeTab}
      onTabChange={admin.setActiveTab}
      message={admin.message}
      error={admin.error}
      busy={admin.busy}
    >
      {admin.activeTab === "overview" && (
        <AdminOverview
          overview={admin.overview}
          busy={admin.busy}
          onRefresh={admin.refreshOverview}
        />
      )}

      {admin.activeTab === "settings" && (
        <AdminSettings
          overview={admin.overview}
          queueRedisUrl={admin.queueRedisUrl}
          clearQueueRedisUrl={admin.clearQueueRedisUrl}
          busy={admin.busy}
          onSettingsChange={admin.updateSettings}
          onQueueRedisUrlChange={admin.setQueueRedisUrl}
          onClearQueueRedisUrlChange={admin.setClearQueueRedisUrl}
          onSaveSettings={() => void admin.saveSettings()}
        />
      )}

      {admin.activeTab === "providers" && (
        <AdminProviders
          providers={admin.providers}
          selectedProviderId={admin.selectedProviderId}
          draft={admin.providerDraft}
          busy={admin.busy}
          onSelectProvider={admin.selectProviderForEdit}
          onDraftChange={admin.updateProviderDraft}
          onAddProvider={admin.addProviderDraft}
          onSaveProvider={() => void admin.saveProviderDraft()}
          onTestProvider={(providerId) => void admin.testProviderDraft(providerId)}
        />
      )}

      {admin.activeTab === "users" && (
        <AdminUsers
          users={admin.filteredUsers}
          currentUser={currentUser}
          userSearch={admin.userSearch}
          newUserEmail={admin.newUserEmail}
          newUserPassword={admin.newUserPassword}
          newUserRole={admin.newUserRole}
          resetPasswordUserId={admin.resetPasswordUserId}
          resetPassword={admin.resetPassword}
          busy={admin.busy}
          onUserSearchChange={admin.setUserSearch}
          onNewUserEmailChange={admin.setNewUserEmail}
          onNewUserPasswordChange={admin.setNewUserPassword}
          onNewUserRoleChange={admin.setNewUserRole}
          onCreateUser={() => void admin.createUser()}
          onToggleUserDisabled={(user) => void admin.toggleUserDisabled(user)}
          onChangeUserRole={(user, role) => void admin.changeUserRole(user, role)}
          onResetPasswordUserIdChange={admin.setResetPasswordUserId}
          onResetPasswordChange={admin.setResetPassword}
          onResetUserPassword={(user) => void admin.resetUserPassword(user)}
          onRemoveUser={(user) => void admin.removeUser(user)}
        />
      )}

      {admin.activeTab === "usage" && (
        <AdminUsage
          usage={admin.usage}
          users={admin.overview?.users ?? []}
          range={admin.usageRange}
          userId={admin.usageUserId}
          busy={admin.busy}
          onRangeChange={admin.setUsageRange}
          onUserIdChange={admin.setUsageUserId}
          onRefresh={admin.refreshUsage}
        />
      )}

      {admin.activeTab === "monitor" && (
        <AdminMonitor
          monitor={admin.monitor}
          jobs={admin.adminJobs}
          jobFilters={admin.adminJobFilters}
          jobNextCursor={admin.adminJobCursor}
          users={admin.overview?.users ?? []}
          busy={admin.busy}
          onRefresh={() => {
            void admin.refreshMonitor();
            void admin.refreshAdminJobs();
          }}
          onJobFiltersChange={admin.updateAdminJobFilters}
          onResetJobFilters={admin.resetAdminJobFilters}
          onLoadMoreJobs={admin.loadMoreAdminJobs}
          onJobAction={admin.executeAdminJobAction}
        />
      )}

      {admin.activeTab === "images" && (
        <AdminImages
          images={admin.images}
          users={admin.overview?.users ?? []}
          filters={admin.imageFilters}
          nextCursor={admin.imageCursor}
          busy={admin.busy}
          onFiltersChange={admin.updateImageFilters}
          onResetFilters={admin.resetImageFilters}
          onLoadMore={admin.loadMoreImages}
          onOpenPreview={admin.setSelectedImage}
        />
      )}

      {admin.activeTab === "audit" && (
        <AdminAudit
          logs={admin.auditLogs}
          nextCursor={admin.auditCursor}
          busy={admin.busy}
          onRefresh={admin.refreshAuditLogs}
          onLoadMore={admin.loadMoreAuditLogs}
        />
      )}

      <AdminImagePreview
        image={admin.selectedImage}
        onClose={() => admin.setSelectedImage(null)}
      />
    </AdminShell>
  );
}
