/**
 * `/data` with nothing open. The slot needs its own page here: on a client-side navigation a
 * parallel route keeps whatever it last rendered unless the new URL matches something inside it,
 * so without this the panel would stay open after it was closed.
 */
export default function NoRecordPanel() {
  return null;
}
