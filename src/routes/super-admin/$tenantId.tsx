import { createFileRoute, useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { mailClient } from "@/lib/api/client";

export const Route = createFileRoute("/super-admin/$tenantId")({
  component: TenantManagePage,
});

function TenantManagePage() {
  const { tenantId } = useParams({
    from: "/super-admin/$tenantId",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: async () => {
      const res = await mailClient.platformOverview();
      return res.tenants.find((t) => t.id === tenantId);
    },
  });

  if (isLoading) return <div className="p-6">Loading tenant...</div>;

  if (!data)
    return <div className="p-6">Tenant not found</div>;

  return (
    <div className="mx-auto max-w-5xl p-6">

      <h1 className="text-2xl font-bold">
        {data.name}
      </h1>

      <div className="mt-6 grid gap-4 md:grid-cols-3">

        <Card title="Domain">
          {data.hostname}
        </Card>

        <Card title="Plan">
          <Badge>{data.plan}</Badge>
        </Card>

        <Card title="Status">
          <Badge>
            {data.status}
          </Badge>
        </Card>

      </div>


      <div className="mt-8 rounded-xl border p-6">

        <h2 className="font-semibold mb-4">
          Tenant Actions
        </h2>

        <div className="flex gap-3">

          <Button>
            Manage Mailboxes
          </Button>

          <Button variant="outline">
            Edit Branding
          </Button>

          <Button variant="outline">
            View Audit Log
          </Button>

        </div>

      </div>


    </div>
  );
}


function Card({
 title,
 children
}:{
 title:string;
 children:React.ReactNode
}){

return (
<div className="rounded-xl border p-4">
<p className="text-sm text-muted-foreground">
{title}
</p>

<div className="mt-2 font-medium">
{children}
</div>

</div>
)

}