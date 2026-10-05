import { atom } from 'recoil';

export const adminLLMDialogOpenAtom = atom<boolean>({
  key: 'adminLLMDialogOpen',
  default: false,
});
