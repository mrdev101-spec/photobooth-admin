/** What every form server action returns (used with React's useActionState). Shared with client components. */
export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Shown once after creating an account / resetting a password. */
  tempPassword?: string;
  tempPasswordFor?: string;
}

export const initialActionState: ActionState = { ok: false };
