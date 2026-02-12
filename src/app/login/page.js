"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OptiWareLogo from "@/components/OptiWareLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";

const DEMO = {
  manager: { email: "manager@optiware.com", password: "manager123" },
  staff: { email: "staff@optiware.com", password: "staff123" },
};

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [role, setRole] = useState("manager");
  const [email, setEmail] = useState(DEMO.manager.email);
  const [password, setPassword] = useState(DEMO.manager.password);
  const [error, setError] = useState(null);

  const ctaLabel = useMemo(
    () => (role === "manager" ? "Sign in as Manager" : "Sign in as Staff"),
    [role]
  );

  const onRoleChange = (v) => {
    const r = v === "staff" ? "staff" : "manager";
    setRole(r);
    setEmail(DEMO[r].email);
    setPassword(DEMO[r].password);
    setError(null);
  };

  const handleLogin = () => {
    setError(null);

    const expected = DEMO[role];
    const ok =
      email.trim().toLowerCase() === expected.email.toLowerCase() &&
      password === expected.password;

    if (!ok) {
      setError("Invalid credentials. Try demo credentials.");
      return;
    }

    login("demo-token", role);
  };

  const autoFill = () => {
    setEmail(DEMO[role].email);
    setPassword(DEMO[role].password);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-center mb-8">
          <OptiWareLogo size="lg" />
        </div>

        <Card className="shadow-sm">
          <CardContent className="p-8">
            <h1 className="text-2xl font-semibold mb-1">Sign in</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Choose your role and enter credentials
            </p>

            <Tabs value={role} onValueChange={onRoleChange} className="mb-6">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="manager">Manager</TabsTrigger>
                <TabsTrigger value="staff">Staff</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <div className="text-sm text-red-500">{error}</div>
              )}

              <Button className="w-full" onClick={handleLogin}>
                {ctaLabel}
              </Button>

              <div className="border rounded-lg p-4 text-sm bg-muted/30">
                <div className="font-medium mb-2">Demo credentials:</div>
                <div className="text-muted-foreground">
                  {role === "manager"
                    ? `manager@optiware.com / manager123`
                    : `staff@optiware.com / staff123`}
                </div>
                <button
                  className="text-primary text-sm mt-2 hover:underline"
                  onClick={autoFill}
                  type="button"
                >
                  Auto-fill credentials
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
