import React from 'react';
import { useRecoilState } from 'recoil';
import { adminLLMDialogOpenAtom } from '~/store/adminLLM';
import AdminLLMConfig from './AdminLLMConfig';
import { useAuthContext } from '~/hooks';
import { SystemRoles } from 'librechat-data-provider';

export default function AdminLLMModal() {
  const [isOpen, setIsOpen] = useRecoilState(adminLLMDialogOpenAtom);
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  if (!isOpen || !isAdmin) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-6xl rounded-2xl border border-border-light bg-surface-primary p-6 shadow-2xl">
        <AdminLLMConfig onClose={() => setIsOpen(false)} />
      </div>
    </div>
  );
}
