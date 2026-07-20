import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import type { TimelineEntry } from "@/modules/patient/timeline.service";

/**
 * PDF export via @react-pdf/renderer — it renders in-process, so there is no
 * headless browser to install or keep warm. That matters on Vercel, where a
 * Chromium binary would blow the function size limit and the cold start.
 */

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#0f1729", fontFamily: "Helvetica" },
  header: { marginBottom: 18, borderBottomWidth: 1, borderBottomColor: "#d9dee6", paddingBottom: 10 },
  brand: { fontSize: 9, color: "#0d7266", letterSpacing: 1, marginBottom: 6 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 9, color: "#58627a", marginTop: 3 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  row: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#e6eaf0" },
  date: { width: 78, color: "#58627a" },
  kind: { width: 82, color: "#0d7266", fontSize: 8, textTransform: "uppercase" },
  body: { flex: 1 },
  detail: { color: "#58627a", fontSize: 9, marginTop: 1 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 4 },
  metaItem: { width: "50%", marginBottom: 4 },
  metaLabel: { fontSize: 8, color: "#58627a" },
  metaValue: { fontSize: 10 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#8a94a6",
    borderTopWidth: 0.5,
    borderTopColor: "#e6eaf0",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export interface ExportProfile {
  fullName: string;
  dateOfBirth: Date | null;
  gender: string;
  bloodGroup: string;
  phone: string | null;
  city: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(
    value,
  );
}

function HealthRecordDocument({
  profile,
  entries,
  generatedAt,
}: {
  profile: ExportProfile;
  entries: TimelineEntry[];
  generatedAt: Date;
}) {
  return (
    <Document
      title={`HealthLocker — ${profile.fullName}`}
      author="HealthLocker"
      subject="Health record export"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>HEALTHLOCKER</Text>
          <Text style={styles.title}>{profile.fullName}</Text>
          <Text style={styles.subtitle}>
            Health record · exported {formatDate(generatedAt)}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.meta}>
          {[
            ["Date of birth", formatDate(profile.dateOfBirth)],
            ["Blood group", profile.bloodGroup],
            ["Gender", profile.gender.toLowerCase()],
            ["Phone", profile.phone ?? "—"],
            ["City", profile.city ?? "—"],
            [
              "Emergency contact",
              profile.emergencyContactName
                ? `${profile.emergencyContactName}${profile.emergencyContactPhone ? ` · ${profile.emergencyContactPhone}` : ""}`
                : "—",
            ],
          ].map(([label, value]) => (
            <View key={label} style={styles.metaItem}>
              <Text style={styles.metaLabel}>{label}</Text>
              <Text style={styles.metaValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>
          History ({entries.length} {entries.length === 1 ? "entry" : "entries"})
        </Text>

        {entries.length === 0 ? (
          <Text style={styles.detail}>No records yet.</Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.row} wrap={false}>
              <Text style={styles.date}>{formatDate(entry.occurredAt)}</Text>
              <Text style={styles.kind}>{entry.kind.replace(/_/g, " ")}</Text>
              <View style={styles.body}>
                <Text>{entry.title}</Text>
                {entry.detail || entry.source ? (
                  <Text style={styles.detail}>
                    {[entry.detail, entry.source].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        )}

        <View style={styles.footer} fixed>
          <Text>
            Exported from HealthLocker. Not a medical document — confirm with your doctor.
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderHealthRecordPdf(
  profile: ExportProfile,
  entries: TimelineEntry[],
): Promise<Buffer> {
  return renderToBuffer(
    <HealthRecordDocument profile={profile} entries={entries} generatedAt={new Date()} />,
  );
}
