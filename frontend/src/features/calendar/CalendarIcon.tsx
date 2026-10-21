export function CalendarIcon({
  name,
}: {
  name:
    | 'calendar'
    | 'left'
    | 'right'
    | 'search'
    | 'close'
    | 'clock'
    | 'pin'
    | 'check'
    | 'download'
    | 'arrow'
    | 'filter'
    | 'heart'
}) {
  const paths = {
    calendar:
      'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 10h2m4 0h2m-8 4h2',
    left: 'm14 6-6 6 6 6',
    right: 'm10 6 6 6-6 6',
    search: 'm21 21-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z',
    close: 'm6 6 12 12M6 18 18 6',
    clock: 'M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
    pin: 'M12 22s8-8 8-13a8 8 0 1 0-16 0c0 5 8 13 8 13Zm0-16a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    check: 'm5 12 4 4L19 6',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    filter: 'M4 7h16M7 12h10m-7 5h4',
    heart:
      'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
