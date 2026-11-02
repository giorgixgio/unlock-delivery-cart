import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useCallQueueAccess } from "@/hooks/useCallQueueAccess";
import { outcomeLockFor } from "@/lib/outcomeLock";

/** { locked, reason } — true only for managers (not admins) while "Operators use Call Queue" is on. */
export function useOutcomeLock() {
  const { user, role } = useAdminAuth();
  const { settings } = useCallQueueAccess();
  return outcomeLockFor(role, user?.email, settings);
}
