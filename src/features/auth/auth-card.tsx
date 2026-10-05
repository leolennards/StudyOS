import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <Card className="gap-6 py-6 shadow-sm">
        <CardHeader className="px-6">
          <CardTitle className="text-xl">
            <h1>{title}</h1>
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="px-6">{children}</CardContent>
      </Card>
      {footer && <p className="text-muted-foreground mt-6 text-center text-sm">{footer}</p>}
    </>
  );
}
