import { z } from "zod";

/** A missing continuation is unknown coverage, never a successful empty list. */
export function parseComposerReferences(
  kind: "giphy" | "release_forms" | "taggable_users",
  value: unknown,
) {
  const envelope = z
    .object({
      data: z.unknown(),
      _pagination: z
        .object({ next_page: z.string().nullable().optional() })
        .optional(),
    })
    .parse(value);
  const rows =
    kind === "giphy"
      ? z.array(z.unknown()).parse(envelope.data)
      : z.object({ items: z.array(z.unknown()) }).parse(envelope.data).items;
  const exactId = z.union([
    z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
    z.number().int().nonnegative().safe().transform(String),
  ]);
  const items = rows.slice(0, 50).map((value) => {
    const row = z
      .object({
        id: exactId,
        title: z.string().optional(),
        name: z.string().optional(),
        type: z.string().optional(),
        user_partner_id: exactId.nullable().optional(),
        user: z
          .object({
            id: exactId,
            username: z.string().optional(),
            isFromGuest: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(value);
    return {
      id: row.id,
      label: row.title ?? row.name ?? row.user?.username ?? row.id,
      type: row.type ?? null,
      partnerId: row.user_partner_id ?? null,
      guest: row.user?.isFromGuest ?? null,
    };
  });
  return {
    items,
    partial: envelope._pagination?.next_page !== null || rows.length > 50,
  };
}
