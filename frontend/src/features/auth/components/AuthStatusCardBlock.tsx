import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface AuthStatusCardBlockProps {
  tone: "loading" | "error" | "denied" | "success";
  title: string;
  description: string;
  alertTitle?: string;
  alertMessage?: string;
  actions?: ReactNode;
  footer?: ReactNode;
}

export function AuthStatusCardBlock({
  tone,
  title,
  description,
  alertTitle,
  alertMessage,
  actions,
  footer,
}: AuthStatusCardBlockProps) {
  const Icon =
    tone === "loading"
      ? Loader2
      : tone === "denied"
        ? ShieldAlert
        : tone === "success"
          ? CheckCircle2
          : AlertCircle;

  return (
    <Card className="w-full shadow-sm [--card-spacing:--spacing(6)] ring-0 border-none shadow-none rounded-none bg-transparent">
      <CardHeader className="text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-muted text-foreground"
        >
          <Icon
            className={
              tone === "loading" ? "size-5 animate-spin" : "size-5"
            }
          />
        </div>
        <CardTitle className="text-xl font-semibold tracking-tight">
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {alertMessage ? (
          <Alert variant={tone === "error" || tone === "denied" ? "destructive" : "default"}>
            <Icon aria-hidden="true" />
            {alertTitle ? <AlertTitle>{alertTitle}</AlertTitle> : null}
            <AlertDescription>{alertMessage}</AlertDescription>
          </Alert>
        ) : null}

        {actions ? <div className="flex flex-col gap-2">{actions}</div> : null}
      </CardContent>

      {footer ? (
        <CardFooter className="justify-center text-center text-xs text-muted-foreground">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}
