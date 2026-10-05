import { memo, useMemo } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useParams } from 'react-router-dom';
import { Key } from 'lucide-react';
import {
  getConfigDefaults,
  Constants,
  PermissionTypes,
  Permissions,
  SystemRoles,
} from 'librechat-data-provider';
import { OpenSidebar, PresetsMenu, NewChat, HeaderMenu } from './Menus';
import { TemporaryChat, TemporaryChatIndicator } from './TemporaryChat';
import ModelSelector from './Menus/Endpoints/ModelSelector';
import { adminLLMDialogOpenAtom } from '~/store/adminLLM';
import AdminLLMModal from '~/components/Nav/SettingsTabs/General/AdminLLMModal';
import { BackgroundTasksButton } from './BackgroundTasks';
import { TraceButton, useTraceControl } from './Trace';
import { useGetStartupConfig } from '~/data-provider';
import ExportAndShareMenu from './ExportAndShareMenu';
import SubagentThreadLink from './SubagentThreadLink';
import BookmarkMenu from './Menus/BookmarkMenu';
import AddMultiConvo from './AddMultiConvo';
import { useHasAccess, useAuthContext } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

/**
 * Three zones in a single DOM order that serves both layouts: hidden items
 * generate no flex gap, so each breakpoint collapses to the right row without
 * reordering. Branching is CSS-only — `useMediaQuery` resolves after paint and
 * would pop the row a frame late on every mount.
 */
function Header({
  parentConversationId,
  readOnly = false,
}: {
  parentConversationId?: string;
  readOnly?: boolean;
}) {
  const { data: startupConfig } = useGetStartupConfig();
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;
  const setAdminLLMDialogOpen = useSetRecoilState(adminLLMDialogOpenAtom);
  const navVisible = useRecoilValue(store.sidebarExpanded);
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));

  /** The mobile row only offers a new chat when there is one to leave. Read
   *  from the route rather than the context conversation, which still holds the
   *  previous chat for a render after a history or link navigation. An unsaved
   *  conversation has no id in the route yet, so absence counts as new too. */
  const { conversationId: routeConversationId } = useParams();
  const isNewChat = routeConversationId == null || routeConversationId === Constants.NEW_CONVO;

  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  const hasAccessToMultiConvo = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });

  const hasAccessToTemporaryChat = useHasAccess({
    permissionType: PermissionTypes.TEMPORARY_CHAT,
    permission: Permissions.USE,
  });

  /** Child threads are view-only records of their parent's run and have no trace of their own. */
  const trace = useTraceControl({
    conversationId: isNewChat ? null : routeConversationId,
    traceViewer: interfaceConfig.traceViewer,
    isSubmitting,
    enabled: parentConversationId == null,
  });

  /** The drawer covers the header on mobile; keep its controls out of the tab order. */
  const hiddenBehindNav = navVisible === true && 'max-md:hidden';

  return (
    /* The composer review is in a z-10 stacking context. Keep header controls
       above it when a tall review reaches the top of a short viewport. */
    <div className="absolute top-0 z-20 flex h-[52px] w-full items-center gap-2 bg-gradient-to-b from-presentation via-presentation/70 to-transparent p-2 font-semibold text-text-primary md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 2xl:via-transparent">
      <div className="flex flex-shrink-0 items-center md:hidden">
        <OpenSidebar testId="header-open-sidebar-button" />
      </div>

      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 md:pl-3 md:transition-all md:duration-200 md:ease-in-out',
          hiddenBehindNav,
        )}
      >
        {parentConversationId != null && (
          <SubagentThreadLink threadId={parentConversationId} labelClassName="hidden lg:inline" />
        )}
        {!readOnly && <ModelSelector startupConfig={startupConfig} />}
        {!readOnly && isAdmin && (
          <button
            type="button"
            onClick={() => setAdminLLMDialogOpen(true)}
            title="Configure LLMs and API Keys (Admin)"
            className="my-1 flex h-9 items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-600 shadow-sm transition hover:bg-orange-500/20 active:scale-95 dark:text-orange-400"
          >
            <Key className="size-3.5" />
            <span className="hidden sm:inline">LLM Keys</span>
          </button>
        )}
        {!readOnly && isAdmin && interfaceConfig.presets === true && interfaceConfig.modelSelect === true && (
          <PresetsMenu />
        )}
        {hasAccessToBookmarks === true && (
          <div className="hidden items-center md:flex">
            <BookmarkMenu />
          </div>
        )}
        {hasAccessToMultiConvo === true && (
          <div className="hidden items-center md:flex">
            <AddMultiConvo />
          </div>
        )}
      </div>

      <div className={cn('flex flex-shrink-0 items-center gap-2', hiddenBehindNav)}>
        {hasAccessToTemporaryChat === true && <TemporaryChatIndicator />}
        {!isNewChat && <NewChat className="md:hidden" />}
        {!isNewChat && parentConversationId == null && (
          <BackgroundTasksButton
            key={routeConversationId}
            conversationId={routeConversationId}
            isSubmitting={isSubmitting}
          />
        )}
        <HeaderMenu startupConfig={startupConfig} trace={trace} className="md:hidden" />
        <div className="hidden items-center gap-2 md:flex">
          {trace.show && <TraceButton onClick={trace.open} />}
          <ExportAndShareMenu isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false} />
          {hasAccessToTemporaryChat === true && <TemporaryChat />}
        </div>
      </div>
      {isAdmin && <AdminLLMModal />}
    </div>
  );
}

const MemoizedHeader = memo(Header);
MemoizedHeader.displayName = 'Header';

export default MemoizedHeader;
