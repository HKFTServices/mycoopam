import { Navigate, useLocation } from "react-router-dom";

const RecoveryLinkRedirect = () => {
  const location = useLocation();

  if (location.pathname === "/reset-password") {
    return null;
  }

  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));

  const isRecoveryFlow =
    searchParams.get("type") === "recovery" ||
    hashParams.get("type") === "recovery";

  const hasRecoveryCredentials =
    hashParams.has("access_token") ||
    hashParams.has("token_hash") ||
    searchParams.has("token_hash") ||
    (searchParams.has("code") && isRecoveryFlow);

  if (!isRecoveryFlow || !hasRecoveryCredentials) {
    return null;
  }

  return (
    <Navigate
      replace
      to={{
        pathname: "/reset-password",
        search: location.search,
        hash: location.hash,
      }}
    />
  );
};

export default RecoveryLinkRedirect;
