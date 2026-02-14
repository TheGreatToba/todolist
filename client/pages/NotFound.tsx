import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/15 mb-6">
          <span className="text-4xl">❌</span>
        </div>
        <h1 className="text-5xl font-bold text-foreground mb-2">404</h1>
        <h2 className="text-2xl font-semibold text-foreground mb-4">Page Not Found</h2>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist. It might have been removed or the URL might be incorrect.
        </p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition inline-block"
        >
          Return to Home
        </button>
      </div>
    </div>
  );
};

export default NotFound;
