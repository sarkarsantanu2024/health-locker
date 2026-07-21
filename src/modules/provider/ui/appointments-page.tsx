import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { requireTenantPermission } from "@/lib/auth/session";
import { addDays, formatDate, toDateInputValue } from "@/lib/format";
import { listAppointments } from "@/modules/provider/clinical.service";
import { listPractitioners, searchPatients } from "@/modules/provider/patients.service";
import { AppointmentRow, BookAppointmentForm } from "@/modules/provider/ui/appointment-client";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { Table, TableWrap, Tbody, Th, Thead, Tr } from "@/ui/table";
import { toneFor } from "@/ui/tone";

/**
 * The day list. Which day is in the URL (`?date=`), not in client state, so a
 * receptionist can keep tomorrow's list open in a second tab and a refresh does
 * not silently jump back to today.
 */
export async function ProviderAppointmentsPage({
  base,
  date,
  patientId,
}: {
  base: string;
  date?: string;
  patientId?: string;
}) {
  const { orgId } = await requireTenantPermission("appointment:read");

  const day = date && !Number.isNaN(new Date(date).getTime()) ? new Date(date) : new Date();
  const dayValue = toDateInputValue(day);

  const [appointments, patients, practitioners] = await Promise.all([
    listAppointments(orgId, { day }),
    searchPatients(orgId, "", { take: 200 }),
    listPractitioners(orgId),
  ]);

  const prev = toDateInputValue(addDays(day, -1));
  const next = toDateInputValue(addDays(day, 1));
  const today = toDateInputValue(new Date());

  const linkClass = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted";

  return (
    <>
      <PageHeader
        title="Appointments"
        icon={CalendarDays}
        tone={toneFor("appointment")}
        description={`${appointments.length} on ${formatDate(day)}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`${base}/appointments?date=${prev}`} className={linkClass}>
          ← Previous
        </Link>
        <Link
          href={`${base}/appointments?date=${today}`}
          className={cn(linkClass, dayValue === today && "border-primary bg-primary-subtle text-primary")}
        >
          Today
        </Link>
        <Link href={`${base}/appointments?date=${next}`} className={linkClass}>
          Next →
        </Link>

        <form method="get" className="ml-auto flex items-center gap-2">
          <label htmlFor="date-jump" className="text-sm text-muted-foreground">
            Jump to
          </label>
          <input
            id="date-jump"
            type="date"
            name="date"
            defaultValue={dayValue}
            className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-sm"
          />
          <button type="submit" className={linkClass}>
            Go
          </button>
        </form>
      </div>

      {appointments.length === 0 ? (
        <div className="mb-6">
          <EmptyState
            title="Nothing booked for this day"
            description="Use the form below to add one."
            art="calendar"
            tone={toneFor("appointment")}
          />
        </div>
      ) : (
        <TableWrap className="mb-6">
          <Table>
            <Thead>
              <Tr>
                <Th>Time</Th>
                <Th>Patient</Th>
                <Th>With</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {appointments.map((appointment) => (
                <AppointmentRow key={appointment.id} appointment={appointment} base={base} />
              ))}
            </Tbody>
          </Table>
        </TableWrap>
      )}

      <BookAppointmentForm
        patients={patients.map((patient) => ({
          id: patient.id,
          fullName: patient.fullName,
          mrn: patient.mrn,
          phone: patient.phone,
        }))}
        practitioners={practitioners}
        defaultPatientId={patientId}
        defaultDate={`${dayValue}T10:00`}
      />
    </>
  );
}
