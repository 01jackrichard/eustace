import { useParams, Navigate } from 'react-router-dom';

/**
 * Direct route redirector:
 * Integrates all messaging directly into the Friends tab (/friends?tab=messages&chat=:friendId)
 * Ensuring consistency with Eustace single-workspace architecture.
 */
export function ChatPage() {
  const { friendId } = useParams<{ friendId: string }>();

  if (!friendId) {
    return <Navigate to="/friends?tab=messages" replace />;
  }

  return <Navigate to={`/friends?tab=messages&chat=${friendId}`} replace />;
}
