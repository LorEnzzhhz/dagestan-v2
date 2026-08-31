import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { ArrowRight, User } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);

  useEffect(() => {
    if (isAuthenticated) navigate(redirect);
  }, [isAuthenticated, navigate, redirect]);

  const handleGuestLogin = () => {
    // Already "logged in" as guest via localStorage - just redirect
    navigate(redirect);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border/70">
        <CardHeader className="text-center">
          <img src={logo} alt="Dagestan" className="mx-auto mb-4 size-12" />
          <CardTitle className="text-xl">Welcome to Dagestan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            onClick={handleGuestLogin}
          >
            <User className="mr-2 size-4" />
            Continue as Guest
            <ArrowRight className="ml-auto size-4" />
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            All data stays on your device. No account needed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Auth {...props} />
  );
}
