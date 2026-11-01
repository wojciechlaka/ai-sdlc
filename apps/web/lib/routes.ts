// Page paths of the app; they mirror the folders under `app/`.

/** Root of every page: `revalidatePath(APP_ROOT, 'layout')` refreshes the whole tree. */
export const APP_ROOT = '/'
/** The board (`app/page.tsx`). */
export const BOARD_PATH = '/'

/** Page of one ticket (`app/tickets/[key]/page.tsx`). */
export function ticketPath(key: string): string {
  return `/tickets/${encodeURIComponent(key)}`
}
