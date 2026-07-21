import { Search, UserPlus, Users } from "lucide-react";
import Link from "next/link";

import { requireTenantPermission } from "@/lib/auth/session";
import { ageFrom, formatDate, humanizeEnum } from "@/lib/format";
import { searchPatients } from "@/modules/provider/patients.service";
import { buttonVariants } from "@/ui/button";
import { Input } from "@/ui/field";
import { EmptyState, PageHeader } from "@/ui/page-header";
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from "@/ui/table";
import { toneFor } from "@/ui/tone";

/**
 * The tenant's patient register, shared by all four provider consoles.
 *
 * Search runs on the server from `?q=`, not in client state, so a filtered list
 * is a shareable URL and the back button behaves — and so a receptionist's
 * search is never limited to the page of rows that happened to load.
 */
export async function ProviderPatientsPage({ base, query }: { base: string; query: string }) {
  const { orgId } = await requireTenantPermission("patient:read");
  const patients = await searchPatients(orgId, query);

  return (
    <>
      <PageHeader
        title="Patients"
        icon={Users}
        tone={toneFor("patient")}
        description="Everyone registered with this organisation."
        action={
          <Link href={`${base}/patients/new`} className={buttonVariants({ size: "sm" })}>
            <UserPlus aria-hidden className="size-4" />
            Register patient
          </Link>
        }
      />

      <form method="get" className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Name, phone or file number"
            aria-label="Search patients"
            className="pl-9"
          />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          Search
        </button>
      </form>

      {patients.length === 0 ? (
        <EmptyState
          title={query ? "No matching patients" : "No patients yet"}
          description={
            query
              ? "This searches only your own register — a patient registered elsewhere will not appear."
              : "Register your first patient to start booking appointments and recording visits."
          }
          /* "no results" and "no data" are different problems and get different art. */
          art={query ? "search" : "people"}
          tone={toneFor("patient")}
          action={
            <Link href={`${base}/patients/new`} className={buttonVariants({ size: "sm" })}>
              Register patient
            </Link>
          }
        />
      ) : (
        <TableWrap>
          <Table>
            <Thead>
              <Tr>
                <Th>Patient</Th>
                <Th>File no.</Th>
                <Th>Phone</Th>
                <Th>Last seen</Th>
              </Tr>
            </Thead>
            <Tbody>
              {patients.map((patient) => {
                const age = ageFrom(patient.dateOfBirth);

                return (
                  <Tr key={patient.id}>
                    <Td>
                      <Link
                        href={`${base}/patients/${patient.id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {patient.fullName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[age !== null ? `${age} yrs` : null, humanizeEnum(patient.gender)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </Td>
                    <Td className="font-mono text-xs">{patient.mrn ?? "—"}</Td>
                    <Td>{patient.phone ?? "—"}</Td>
                    <Td className="text-muted-foreground">
                      {patient.lastSeenAt ? formatDate(patient.lastSeenAt) : "Never"}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
