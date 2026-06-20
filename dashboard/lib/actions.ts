'use server';

import { loginInternal, logoutInternal } from './auth';

export async function loginAction(
  email: string,
  password: string
): Promise<'ok' | 'invalid'> {
  return loginInternal(email, password);
}

export async function logoutAction(): Promise<void> {
  return logoutInternal();
}
