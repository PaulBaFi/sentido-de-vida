// Simulados exclusivamente en tests; nunca se exportan desde src ni se usan en main.
export const subject = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const token = "synthetic.payload.signature";
export const now = 1800000000;
export class TestProfiles {
  calls = [];
  constructor(value) { this.value = value; }
  async findByAuthSubject(id) { this.calls.push(id); return this.value; }
}
export function fixture(role = "paciente") {
  const profiles = new TestProfiles({ id: subject, role, active: true,
    givenName: "Persona", familyName: "Sintética", dni: "never-return", telefono: "never-return" });
  const events = [];
  return {
    profiles, events,
    identity: { async verify() {
      return { subject, verificationMethod: "getClaims", verifiedAt: now - 1, expiresAt: now + 300,
        user_metadata: { role: "administrador" } };
    } },
    audit: { async record(event) { events.push(event); } },
    now: () => now,
  };
}
