import { createContext, useContext } from "react";

export interface AdminAuth {
  /** Mark the session as gone (e.g. any 401) and show the login form. */
  onUnauthorized: () => void;
  /** Log out server-side and show the login form. */
  logout: () => Promise<void>;
}

export const AdminAuthContext = createContext<AdminAuth>({
  onUnauthorized: () => {},
  logout: async () => {},
});

export const useAdminAuth = () => useContext(AdminAuthContext);
