export class UsersFailure extends Error {
  readonly kind: "unauthenticated" | "forbidden" | "dependency_unavailable";
  constructor(kind: "unauthenticated" | "forbidden" | "dependency_unavailable") {
    super(kind);
    this.name = "UsersFailure";
    this.kind = kind;
  }
}
