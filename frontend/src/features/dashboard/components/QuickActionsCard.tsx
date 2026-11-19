import { Link } from "react-router-dom";
import { CalendarDays, Plus, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function QuickActionsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Common front-desk shortcuts.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Button
          size="lg"
          className="w-full justify-start"
          nativeButton={false}
          render={<Link to="/orders/new" />}
        >
          <Plus aria-hidden="true" className="size-4" />
          <span>New Laundry Order</span>
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="w-full justify-start"
          nativeButton={false}
          render={<Link to="/deliveries" />}
        >
          <Truck aria-hidden="true" className="size-4" />
          <span>Manage Deliveries</span>
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="w-full justify-start"
          nativeButton={false}
          render={<Link to="/customers" />}
        >
          <Users aria-hidden="true" className="size-4" />
          <span>Customer Directory</span>
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="w-full justify-start"
          nativeButton={false}
          render={<Link to="/calendar" />}
        >
          <CalendarDays aria-hidden="true" className="size-4" />
          <span>Schedule Calendar</span>
        </Button>
      </CardContent>
    </Card>
  );
}
