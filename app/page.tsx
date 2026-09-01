'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react';

type Booking = {
  id: number;
  bookingDate: string;
  time: string;
  end: string;
  title: string;
  equipment: string;
  owner: string;
  color: string;
};

type BookingDraft = {
  date: string;
  time: string;
  end: string;
  ownerName: string;
  equipment: string;
};

type PendingCreate = {
  draft: BookingDraft;
  deleted: boolean;
  settled: Promise<void>;
  resolve: () => void;
};

type ColorAssignments = Record<string, number>;

type ModalMode = 'create' | 'view' | 'edit';
type ManagedList = 'users' | 'equipment';

const MIN_YEAR = 2026;
const MAX_YEAR = 2036;
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const mondayWeekDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const labUsers = ['Stamatis Argyroudis', 'Marc Parrilla', 'Antonio Dominguez-Alfaro'];
const equipmentOptions = ['3D Printer - Asiga MAX X27', '3D Printer - Elegoo Mars 5 Ultra', 'Optical Microscope - Zeiss Primotech', 'Potentiostat'];
const DAY_START_MINUTES = 9 * 60;
const DAY_END_MINUTES = 21 * 60;
const DAY_SPAN_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;
const hourRows = Array.from({ length: DAY_SPAN_MINUTES / 60 + 1 }, (_, index) => minutesToTime(DAY_START_MINUTES + (index * 60)));
const timeOptions = Array.from({ length: DAY_SPAN_MINUTES / 30 + 1 }, (_, index) => minutesToTime(DAY_START_MINUTES + (index * 30)));
const initialBookings: Booking[] = [
  { id: 1, bookingDate: '2026-01-14', time: '09:00', end: '11:00', title: '3D Printer - Asiga MAX X27', equipment: '3D Printer - Asiga MAX X27', owner: 'Stamatis Argyroudis', color: 'mint' },
  { id: 2, bookingDate: '2026-01-14', time: '10:30', end: '12:00', title: 'Optical Microscope - Zeiss Primotech', equipment: 'Optical Microscope - Zeiss Primotech', owner: 'Marc Parrilla', color: 'lilac' },
];

function formatIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateInput(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
}

function parseDateInput(value: string) {
  const cleaned = value.replace(/[^0-9/]/g, '');
  const parts = cleaned.split('/');
  return parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4
    ? `${parts[2]}-${parts[1]}-${parts[0]}`
    : cleaned;
}

function dateFromIso(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function TimePicker({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const options = timeOptions.includes(value) ? timeOptions : [value, ...timeOptions];
  return <label className="time-picker"><span>{label}</span><span className="select-control"><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{options.map((time) => <option key={time} value={time}>{time}</option>)}</select><ChevronIcon /></span></label>;
}

const bookingPalette = [
  { background: '#dcefe5', border: '#78ae91', text: '#315c4c', muted: '#5b7b6b' },
  { background: '#eae6f6', border: '#a28dc9', text: '#655187', muted: '#786a96' },
  { background: '#fbe2da', border: '#e88f80', text: '#884f46', muted: '#98665e' },
  { background: '#e1eef2', border: '#84b5c5', text: '#4b7481', muted: '#678a95' },
  { background: '#f5edd0', border: '#c4a64b', text: '#6b5618', muted: '#88762f' },
  { background: '#d8f0ee', border: '#51a8a0', text: '#276c68', muted: '#4d8884' },
  { background: '#f7e0eb', border: '#ce83a5', text: '#7d3c5a', muted: '#99617a' },
  { background: '#f8e5cf', border: '#db9b55', text: '#81501f', muted: '#9a6d3c' },
  { background: '#e1e8fb', border: '#8ca3d8', text: '#45609a', muted: '#687da9' },
  { background: '#e8eed9', border: '#9eae6c', text: '#59662d', muted: '#75814a' },
  { background: '#eee1ef', border: '#bc91bf', text: '#704b73', muted: '#8e6a91' },
  { background: '#dcebf8', border: '#77a9d0', text: '#365f82', muted: '#5f819d' },
];
const defaultColorIndexes: Record<string, number> = {
  [equipmentOptions[0]]: 0,
  [equipmentOptions[1]]: 1,
  [equipmentOptions[2]]: 2,
  [equipmentOptions[3]]: 3,
};

function bookingColorKey(equipmentName: string, ownerName: string) {
  return `${ownerName.trim().toLocaleLowerCase()}::${equipmentName.trim().toLocaleLowerCase()}`;
}

function hashColorKey(value: string) {
  return Array.from(value).reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7);
}

function isCatalogBooking(equipmentName: string, ownerName: string) {
  return labUsers.includes(ownerName) && equipmentOptions.includes(equipmentName);
}

function bookingColorIndex(equipmentName: string, ownerName: string, assignments: ColorAssignments) {
  const key = bookingColorKey(equipmentName, ownerName);
  if (assignments[key] !== undefined) return assignments[key] % bookingPalette.length;
  if (isCatalogBooking(equipmentName, ownerName)) return defaultColorIndexes[equipmentName] ?? 0;
  return hashColorKey(key) % bookingPalette.length;
}

function readSavedColorAssignments(): ColorAssignments {
  if (typeof window === 'undefined') return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem('lab-calendar-colors') || 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([key, value]) => typeof key === 'string' && Number.isInteger(value) && Number(value) >= 0));
  } catch {
    return {};
  }
}

function nextAvailableColorIndex(key: string, used: Set<number>) {
  const start = hashColorKey(key) % bookingPalette.length;
  for (let offset = 0; offset < bookingPalette.length; offset += 1) {
    const index = (start + offset) % bookingPalette.length;
    if (!used.has(index)) return index;
  }
  return start;
}

function isInRange(date: Date) {
  return date.getFullYear() >= MIN_YEAR && date.getFullYear() <= MAX_YEAR;
}

function defaultDateForMonth(year: number, month: number) {
  const now = new Date();
  return year === now.getFullYear() && month === now.getMonth()
    ? formatIso(now)
    : formatIso(new Date(year, month, 1));
}

function readSavedList(key: string, fallback: string[]) {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
    return Array.isArray(saved) && saved.every((item) => typeof item === 'string') && saved.length > 0 ? saved : fallback;
  } catch {
    return fallback;
  }
}

function ChevronIcon() {
  return <svg className="chevron-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>;
}

function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return <svg className="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'left' ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'} /></svg>;
}

export default function Home() {
  const today = new Date();
  const safeToday = isInRange(today) ? today : new Date(MIN_YEAR, 0, 1);
  const [selectedDate, setSelectedDate] = useState(formatIso(safeToday));
  const [viewYear, setViewYear] = useState(safeToday.getFullYear());
  const [viewMonth, setViewMonth] = useState(safeToday.getMonth());
  const [monthBookings, setMonthBookings] = useState<Booking[]>(initialBookings);
  const [bookings, setBookings] = useState<Booking[]>(initialBookings.filter((booking) => booking.bookingDate === formatIso(safeToday)));
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [draft, setDraft] = useState<BookingDraft>({ date: formatIso(safeToday), time: '16:00', end: '17:00', ownerName: '', equipment: '' });
  const [userOptions, setUserOptions] = useState(() => readSavedList('lab-calendar-users', labUsers));
  const [equipmentChoices, setEquipmentChoices] = useState(() => readSavedList('lab-calendar-equipment', equipmentOptions));
  const [colorAssignments, setColorAssignments] = useState<ColorAssignments>(readSavedColorAssignments);
  const [managedList, setManagedList] = useState<ManagedList | null>(null);
  const [newListValue, setNewListValue] = useState('');
  const [syncError, setSyncError] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [dragAnchor, setDragAnchor] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);
  const monthCache = useRef(new Map<string, Booking[]>());
  const pendingCreates = useRef(new Map<number, PendingCreate>());
  const datePickerRef = useRef<HTMLInputElement>(null);
  const listManagerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { window.localStorage.setItem('lab-calendar-users', JSON.stringify(userOptions)); }, [userOptions]);
  useEffect(() => { window.localStorage.setItem('lab-calendar-equipment', JSON.stringify(equipmentChoices)); }, [equipmentChoices]);
  useEffect(() => { window.localStorage.setItem('lab-calendar-colors', JSON.stringify(colorAssignments)); }, [colorAssignments]);
  useEffect(() => {
    const customKeys = Array.from(new Set(monthBookings.filter((booking) => !isCatalogBooking(booking.equipment, booking.owner)).map((booking) => bookingColorKey(booking.equipment, booking.owner)))).sort();
    if (!customKeys.length) return;
    setColorAssignments((current) => {
      const next = { ...current };
      const used = new Set([0, 1, 2, 3, ...Object.values(next).map((index) => index % bookingPalette.length)]);
      let changed = false;
      customKeys.forEach((key) => {
        if (next[key] !== undefined) return;
        next[key] = nextAvailableColorIndex(key, used);
        used.add(next[key]);
        changed = true;
      });
      return changed ? next : current;
    });
  }, [monthBookings]);
  useEffect(() => {
    if (!managedList) return;
    function dismissListManager(event: Event) {
      const target = event.target as HTMLElement | null;
      if (!listManagerRef.current?.contains(target) && !target?.closest('.field-edit-button')) setManagedList(null);
    }
    document.addEventListener('pointerdown', dismissListManager);
    return () => document.removeEventListener('pointerdown', dismissListManager);
  }, [managedList]);

  const selectedDateObject = useMemo(() => dateFromIso(selectedDate), [selectedDate]);
  const monthLabel = `${monthNames[viewMonth]} ${viewYear}`;
  const selectedLabel = selectedDateObject.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const visibleWeekDays = mondayWeekDays;

  const monthCells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const firstDayIndex = (first.getDay() + 6) % 7;
    const start = new Date(viewYear, viewMonth, 1 - firstDayIndex);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date, iso: formatIso(date), inMonth: date.getMonth() === viewMonth, inRange: isInRange(date) };
    });
  }, [viewMonth, viewYear]);

  const visibleBookings = useMemo(() => bookings.filter((booking) => timeToMinutes(booking.end) > DAY_START_MINUTES && timeToMinutes(booking.time) < DAY_END_MINUTES), [bookings]);
  const layoutBookings = useMemo(() => {
    const sorted = [...visibleBookings].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time) || timeToMinutes(a.end) - timeToMinutes(b.end));
    const groups: Array<{ bookings: Booking[]; end: number }> = [];
    sorted.forEach((booking) => {
      const start = timeToMinutes(booking.time);
      const end = timeToMinutes(booking.end);
      const group = groups[groups.length - 1];
      if (group && start < group.end) {
        group.bookings.push(booking);
        group.end = Math.max(group.end, end);
      } else {
        groups.push({ bookings: [booking], end });
      }
    });
    return groups.flatMap((group) => {
      const laneEnds: number[] = [];
      const placed = group.bookings.map((booking) => {
        const start = timeToMinutes(booking.time);
        let lane = laneEnds.findIndex((end) => end <= start);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(timeToMinutes(booking.end));
        } else {
          laneEnds[lane] = timeToMinutes(booking.end);
        }
        return { booking, lane };
      });
      return placed.map((item) => ({ ...item, laneCount: laneEnds.length }));
    });
  }, [visibleBookings]);
  const visibleMonthBookings = useMemo(() => monthBookings.filter((booking) => timeToMinutes(booking.end) > DAY_START_MINUTES && timeToMinutes(booking.time) < DAY_END_MINUTES), [monthBookings]);
  const visibleBookingCounts = useMemo(() => visibleMonthBookings.reduce<Record<string, number>>((counts, booking) => { counts[booking.bookingDate] = (counts[booking.bookingDate] || 0) + 1; return counts; }, {}), [visibleMonthBookings]);
  const bookingsByDate = useMemo(() => visibleMonthBookings.reduce<Record<string, Booking[]>>((groups, booking) => { (groups[booking.bookingDate] ||= []).push(booking); return groups; }, {}), [visibleMonthBookings]);
  useEffect(() => {
    const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    const controller = new AbortController();
    let active = true;
    const cachedBookings = monthCache.current.get(month);
    if (cachedBookings) {
      setMonthBookings(cachedBookings);
      setBookings(cachedBookings.filter((booking) => booking.bookingDate === selectedDate));
    } else {
      setMonthBookings([]);
    }
    fetch(`/api/lab?month=${month}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Shared data unavailable');
        return response.json() as Promise<{ bookings: Array<Booking & { bookingDate?: string }> }>;
      })
      .then((data) => {
        if (!active) return;
        const nextBookings = data.bookings.map((booking) => ({ ...booking, bookingDate: booking.bookingDate || selectedDate, color: bookingColorKey(booking.equipment, booking.owner) }));
        monthCache.current.set(month, nextBookings);
        setMonthBookings(nextBookings);
        setBookings(nextBookings.filter((booking) => booking.bookingDate === selectedDate));
        setSyncError('');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (active) setSyncError('Shared mode is unavailable right now. Try again in a moment.');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [viewMonth, viewYear]);

  useEffect(() => {
    setBookings(monthBookings.filter((booking) => booking.bookingDate === selectedDate));
  }, [monthBookings, selectedDate]);

  function selectDate(iso: string) {
    const date = dateFromIso(iso);
    if (!isInRange(date)) return;
    setSelectedDate(iso);
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
  }

  function changeMonth(offset: number) {
    const next = new Date(viewYear, viewMonth + offset, 1);
    if (next.getFullYear() < MIN_YEAR || next.getFullYear() > MAX_YEAR) return;
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    setSelectedDate(defaultDateForMonth(next.getFullYear(), next.getMonth()));
  }

  function changeYear(year: number) {
    setViewYear(year);
    setSelectedDate(defaultDateForMonth(year, viewMonth));
  }

  function goToToday() {
    selectDate(formatIso(safeToday));
  }

  function openCreate(startTime = '16:00', endTime = '17:00') {
    setBookingError('');
    setActiveBooking(null);
    setDraft({ date: selectedDate, time: startTime, end: endTime, ownerName: '', equipment: '' });
    setModalMode('create');
  }

  function minutesFromPointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const rawMinutes = DAY_START_MINUTES + ((position / bounds.height) * DAY_SPAN_MINUTES);
    return Math.max(DAY_START_MINUTES, Math.min(DAY_END_MINUTES, Math.round(rawMinutes / 30) * 30));
  }

  function handleTimelinePointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.booking-block')) return;
    const minutes = minutesFromPointer(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragAnchor(minutes);
    setDragCurrent(Math.min(minutes + 30, DAY_END_MINUTES));
  }

  function handleTimelinePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragAnchor === null) return;
    setDragCurrent(minutesFromPointer(event));
  }

  function finishTimelineDrag() {
    if (dragAnchor === null || dragCurrent === null) return;
    const start = Math.min(dragAnchor, dragCurrent);
    const end = Math.max(dragAnchor, dragCurrent, Math.min(dragAnchor + 30, DAY_END_MINUTES));
    setDragAnchor(null);
    setDragCurrent(null);
    openCreate(minutesToTime(start), minutesToTime(end));
  }

  function openBooking(booking: Booking) {
    setBookingError('');
    setActiveBooking(booking);
    setDraft({ date: booking.bookingDate, time: booking.time, end: booking.end, ownerName: booking.owner, equipment: booking.equipment });
    setModalMode('view');
  }

  function updateDraft(key: keyof BookingDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function openDatePicker() {
    if (isReadOnly || !datePickerRef.current) return;
    const picker = datePickerRef.current as HTMLInputElement & { showPicker?: () => void };
    try {
      if (picker.showPicker) picker.showPicker();
      else picker.click();
    } catch {
      picker.click();
    }
  }

  function toggleListManager(list: ManagedList) {
    setManagedList((current) => current === list ? null : list);
    setNewListValue('');
  }

  function addListValue() {
    const value = newListValue.trim();
    if (!value) return;
    if (managedList === 'users') {
      setUserOptions((current) => current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [...current, value]);
    }
    if (managedList === 'equipment') {
      setEquipmentChoices((current) => current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [...current, value]);
    }
    setNewListValue('');
  }

  function removeListValue(list: ManagedList, value: string) {
    if (list === 'users') setUserOptions((current) => current.filter((item) => item !== value));
    if (list === 'equipment') setEquipmentChoices((current) => current.filter((item) => item !== value));
  }

  async function saveBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBookingError('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || formatIso(dateFromIso(draft.date)) !== draft.date || !isInRange(dateFromIso(draft.date))) {
      setBookingError('Enter a valid date as DD/MM/YYYY.');
      return;
    }
    if (draft.end <= draft.time) {
      setBookingError('The end time must be later than the start time.');
      return;
    }
    if (!draft.ownerName || !draft.equipment) {
      setBookingError('Choose a user and equipment before confirming the booking.');
      return;
    }
    const editingBooking = modalMode === 'edit' ? activeBooking : null;
    const isEditing = editingBooking !== null;
    const payload = { type: 'booking', date: draft.date, time: draft.time, end: draft.end, equipment: draft.equipment, ownerName: draft.ownerName };
    const saved: Booking = { id: isEditing ? editingBooking.id : -Date.now(), bookingDate: draft.date, time: draft.time, end: draft.end, title: draft.equipment, equipment: draft.equipment, owner: draft.ownerName, color: bookingColorKey(draft.equipment, draft.ownerName) };
    const previousBookings = monthBookings;
    setMonthBookings((current) => isEditing ? current.map((booking) => booking.id === saved.id ? saved : booking) : [...current, saved]);
    setSelectedDate(draft.date);
    const savedDate = dateFromIso(draft.date);
    setViewYear(savedDate.getFullYear());
    setViewMonth(savedDate.getMonth());
    setModalMode(null);
    const targetMonth = draft.date.slice(0, 7);
    const cachedTarget = monthCache.current.get(targetMonth) || [];
    monthCache.current.set(targetMonth, isEditing
      ? cachedTarget.some((booking) => booking.id === saved.id)
        ? cachedTarget.map((booking) => booking.id === saved.id ? saved : booking)
        : [...cachedTarget, saved]
      : [...cachedTarget, saved]);
    let pendingCreate: PendingCreate | null = null;
    if (!isEditing) {
      let resolvePending = () => {};
      const settled = new Promise<void>((resolve) => { resolvePending = resolve; });
      pendingCreate = { draft: { ...draft }, deleted: false, settled, resolve: resolvePending };
      pendingCreates.current.set(saved.id, pendingCreate);
    }
    try {
      if (pendingCreate) {
        const cleanupWaits = Array.from(pendingCreates.current.values())
          .filter((pending) => pending !== pendingCreate && pending.deleted && pending.draft.date === payload.date && pending.draft.equipment === payload.equipment && timeToMinutes(pending.draft.time) < timeToMinutes(payload.end) && timeToMinutes(pending.draft.end) > timeToMinutes(payload.time))
          .map((pending) => pending.settled);
        await Promise.all(cleanupWaits);
      }
      const response = await fetch('/api/lab', { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingBooking ? { ...payload, id: editingBooking.id } : payload) });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || 'Could not save this booking.');
      }
      const result = await response.json() as { id?: number };
      if (!isEditing) {
        const completed = pendingCreates.current.get(saved.id);
        pendingCreates.current.delete(saved.id);
        if (completed?.deleted) {
          if (result.id) {
            const cleanup = await fetch('/api/lab', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: result.id }) });
            if (!cleanup.ok && cleanup.status !== 404) setSyncError('The deleted booking is still syncing. Please refresh in a moment.');
          }
          completed.resolve();
          return;
        }
        completed?.resolve();
        setMonthBookings((current) => current.map((booking) => booking.id === saved.id ? { ...saved, id: result.id || saved.id } : booking));
      }
    } catch (error) {
      const failedPending = pendingCreate ? pendingCreates.current.get(saved.id) : null;
      pendingCreates.current.delete(saved.id);
      failedPending?.resolve();
      if (failedPending?.deleted) return;
      setMonthBookings(previousBookings);
      setBookingError(error instanceof Error ? error.message : 'Could not save this booking.');
      setDraft(draft);
      setModalMode(isEditing ? 'edit' : 'create');
      monthCache.current.delete(targetMonth);
    }
  }

  async function deleteBooking() {
    if (!activeBooking) return;
    const bookingToDelete = activeBooking;
    const previousBookings = monthBookings;
    setMonthBookings((current) => current.filter((booking) => booking.id !== bookingToDelete.id));
    setModalMode(null);
    setActiveBooking(null);
    const bookingMonth = bookingToDelete.bookingDate.slice(0, 7);
    const cachedMonth = monthCache.current.get(bookingMonth);
    if (cachedMonth) monthCache.current.set(bookingMonth, cachedMonth.filter((booking) => booking.id !== bookingToDelete.id));
    const pendingCreate = pendingCreates.current.get(bookingToDelete.id);
    if (pendingCreate) {
      pendingCreate.deleted = true;
      return;
    }
    try {
      const response = await fetch('/api/lab', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bookingToDelete.id }) });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || 'Could not delete this booking.');
      }
    } catch (error) {
      setMonthBookings(previousBookings);
      setActiveBooking(bookingToDelete);
      setModalMode('view');
      setBookingError(error instanceof Error ? error.message : 'Could not delete this booking.');
    }
  }

  const modalTitle = modalMode === 'create' ? 'Book equipment' : modalMode === 'edit' ? 'Edit reservation' : 'Reservation details';
  const isReadOnly = modalMode === 'view';
  const dragStart = dragAnchor !== null && dragCurrent !== null ? Math.min(dragAnchor, dragCurrent) : null;
  const dragEnd = dragAnchor !== null && dragCurrent !== null ? Math.max(dragAnchor, dragCurrent, Math.min(dragAnchor + 30, DAY_END_MINUTES)) : null;
  const selectableUsers = draft.ownerName && !userOptions.includes(draft.ownerName) ? [draft.ownerName, ...userOptions] : userOptions;
  const selectableEquipment = draft.equipment && !equipmentChoices.includes(draft.equipment) ? [draft.equipment, ...equipmentChoices] : equipmentChoices;

  return (
    <main className="calendar-shell" lang="en-GB">
      <div className="calendar-content">
        <section className="calendar-card" aria-label="Lab calendar">
          <div className="calendar-card-brand"><span className="brand-mark logo-mark"><img src="/lab-logo.png" alt="Printed Bioelectronics Lab logo" /></span><div><strong>Laboratory of Printed Bioelectronics</strong><span>Equipment Booking</span></div></div>
          <div className="calendar-card-head"><div><p className="eyebrow">MONTH VIEW</p><h2>{monthLabel}</h2></div></div>
          <div className="calendar-navigation"><button className="nav-button" onClick={() => changeMonth(-1)} disabled={viewYear === MIN_YEAR && viewMonth === 0} aria-label="Previous month"><ArrowIcon direction="left" /></button><span className="select-control"><select aria-label="Month" value={viewMonth} onChange={(event) => { const month = Number(event.target.value); setViewMonth(month); setSelectedDate(defaultDateForMonth(viewYear, month)); }}>{monthNames.map((month, index) => <option value={index} key={month}>{month}</option>)}</select><ChevronIcon /></span><span className="select-control"><select aria-label="Year" value={viewYear} onChange={(event) => changeYear(Number(event.target.value))}>{Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, index) => MIN_YEAR + index).map((year) => <option value={year} key={year}>{year}</option>)}</select><ChevronIcon /></span><button className="plain-button today-inline" onClick={goToToday}>Today</button><button className="nav-button" onClick={() => changeMonth(1)} disabled={viewYear === MAX_YEAR && viewMonth === 11} aria-label="Next month"><ArrowIcon direction="right" /></button></div>
          <div className="month-grid" role="grid" aria-label={monthLabel}>{visibleWeekDays.map((day) => <div className="weekday" key={day}>{day}</div>)}{monthCells.map(({ date, iso, inMonth, inRange }) => <button key={iso} className={`month-day ${inMonth ? '' : 'outside'} ${selectedDate === iso ? 'selected' : ''} ${!inRange ? 'disabled' : ''}`} onClick={() => selectDate(iso)} disabled={!inRange} aria-label={date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}><span>{date.getDate()}</span>{visibleBookingCounts[iso] > 0 && <div className={`month-booking-swatches ${visibleBookingCounts[iso] > 3 ? 'has-overflow' : ''}`} aria-label={`${visibleBookingCounts[iso]} booking${visibleBookingCounts[iso] === 1 ? '' : 's'}`}>{bookingsByDate[iso].slice(0, 3).map((booking) => <i key={booking.id} className={`booking-swatch booking-color-${bookingColorIndex(booking.equipment, booking.owner, colorAssignments)}`} />)}</div>}{visibleBookingCounts[iso] > 3 && <small className="booking-count">+{visibleBookingCounts[iso] - 3}</small>}</button>)}</div>

          <div className="selected-day-head"><div><p className="eyebrow">SELECTED DAY</p><h3>{selectedLabel}</h3></div><div className="selected-day-meta"><span>{visibleBookings.length} {visibleBookings.length === 1 ? 'booking' : 'bookings'}</span><button className="primary-button" onClick={() => openCreate()}>Book equipment</button></div></div>
          <div className="timeline-wrap"><div className="time-labels">{hourRows.map((hour) => <span key={hour}>{hour}</span>)}</div><div className="timeline-grid" onPointerDown={handleTimelinePointerDown} onPointerMove={handleTimelinePointerMove} onPointerUp={finishTimelineDrag} onPointerCancel={finishTimelineDrag}>{hourRows.map((_, index) => <div className="grid-line" style={{ top: `${index * (100 / (hourRows.length - 1))}%` }} key={index} />)}{dragStart !== null && dragEnd !== null && <div className="drag-selection" style={{ top: `${((dragStart - DAY_START_MINUTES) / DAY_SPAN_MINUTES) * 100}%`, height: `${((dragEnd - dragStart) / DAY_SPAN_MINUTES) * 100}%` }}><strong>{minutesToTime(dragStart)} – {minutesToTime(dragEnd)}</strong><span>Release to book</span></div>}{layoutBookings.map(({ booking, lane, laneCount }) => { const startMinutes = Math.max(timeToMinutes(booking.time), DAY_START_MINUTES); const endMinutes = Math.min(timeToMinutes(booking.end), DAY_END_MINUTES); const duration = endMinutes - startMinutes; const top = (((startMinutes - DAY_START_MINUTES) / DAY_SPAN_MINUTES) * 100) + 1; const height = ((duration / DAY_SPAN_MINUTES) * 100) - 1; const laneWidth = 100 / laneCount; return <div key={booking.id} className={`booking-block booking-color-${bookingColorIndex(booking.equipment, booking.owner, colorAssignments)} ${duration < 120 ? 'compact' : ''} ${duration < 60 ? 'tiny' : ''}`} style={{ top: `${top}%`, height: `${height}%`, left: `calc(${lane * laneWidth}% + 14px)`, right: `calc(${(laneCount - lane - 1) * laneWidth}% + 14px)` }} onPointerDown={(event) => event.stopPropagation()} onClick={() => openBooking(booking)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openBooking(booking); }} role="button" tabIndex={0} aria-label={`${booking.equipment}, ${booking.time} to ${booking.end}, ${booking.owner}`} title="Open booking details"><div className="booking-title-line"><strong>{booking.equipment}</strong><span>{booking.time} – {booking.end} · {booking.owner}</span></div></div>; })}{visibleBookings.length === 0 && dragStart === null && <div className="empty-filter">No bookings for this day yet. Drag across the timeline to book.</div>}</div></div>
        </section>
      </div>

      {syncError && <div className="sync-banner" role="status">{syncError}<button onClick={() => setSyncError('')} aria-label="Dismiss notification">×</button></div>}
      {modalMode && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalMode(null); }}><form className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-dialog-title" onSubmit={saveBooking}><div className="modal-head"><div><h2 id="booking-dialog-title">{modalTitle}</h2></div><button type="button" className="close-button" onClick={() => setModalMode(null)} aria-label="Close booking dialog">×</button></div><label>Date<span className="date-field"><input name="date" type="text" inputMode="numeric" placeholder="DD/MM/YYYY" pattern="\d{2}/\d{2}/\d{4}" value={formatDateInput(draft.date)} onChange={(event) => updateDraft('date', parseDateInput(event.target.value))} onClick={openDatePicker} disabled={isReadOnly} required /><button type="button" className="date-picker-button" onClick={openDatePicker} disabled={isReadOnly} aria-label="Choose date"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></svg></button><input ref={datePickerRef} className="date-picker-native" type="date" min={`${MIN_YEAR}-01-01`} max={`${MAX_YEAR}-12-31`} value={/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? draft.date : ''} onChange={(event) => updateDraft('date', event.target.value)} disabled={isReadOnly} tabIndex={-1} aria-hidden="true" /></span></label><div className="form-grid"><TimePicker label="From" value={draft.time} onChange={(value) => updateDraft('time', value)} disabled={isReadOnly} /><TimePicker label="To" value={draft.end} onChange={(value) => updateDraft('end', value)} disabled={isReadOnly} /></div><label><span className="field-label-row"><span>User</span><button type="button" className="field-edit-button" onClick={() => toggleListManager('users')} aria-label="Manage users" aria-pressed={managedList === 'users'} title="Manage users">✎</button></span><span className="select-control"><select name="ownerName" value={draft.ownerName} onChange={(event) => updateDraft('ownerName', event.target.value)} disabled={isReadOnly} required={!isReadOnly}><option value="" disabled>Choose a user</option>{selectableUsers.map((user) => <option key={user}>{user}</option>)}</select><ChevronIcon /></span>{managedList === 'users' && <div ref={listManagerRef} className="option-manager"><div className="option-manager-add"><input type="text" value={newListValue} onChange={(event) => setNewListValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addListValue(); } }} placeholder="Add a user" aria-label="New user name" /><button type="button" className="plain-button" onClick={addListValue}>Add</button></div><div className="option-manager-list">{userOptions.map((user) => <span className="option-chip" key={user}><span>{user}</span><button type="button" onClick={() => removeListValue('users', user)} aria-label={`Remove ${user}`}>×</button></span>)}</div></div>}</label><label><span className="field-label-row"><span>Equipment</span><button type="button" className="field-edit-button" onClick={() => toggleListManager('equipment')} aria-label="Manage equipment" aria-pressed={managedList === 'equipment'} title="Manage equipment">✎</button></span><span className="select-control"><select name="equipment" value={draft.equipment} onChange={(event) => updateDraft('equipment', event.target.value)} disabled={isReadOnly} required={!isReadOnly}><option value="" disabled>Choose equipment</option>{selectableEquipment.map((item) => <option key={item}>{item}</option>)}</select><ChevronIcon /></span>{managedList === 'equipment' && <div ref={listManagerRef} className="option-manager"><div className="option-manager-add"><input type="text" value={newListValue} onChange={(event) => setNewListValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addListValue(); } }} placeholder="Add equipment" aria-label="New equipment name" /><button type="button" className="plain-button" onClick={addListValue}>Add</button></div><div className="option-manager-list">{equipmentChoices.map((item) => <span className="option-chip" key={item}><span>{item}</span><button type="button" onClick={() => removeListValue('equipment', item)} aria-label={`Remove ${item}`}>×</button></span>)}</div></div>}</label>{bookingError && <p className="form-error" role="alert">{bookingError}</p>}{isReadOnly ? <div className="modal-foot"><button type="button" className="danger-button" onClick={deleteBooking}>Delete booking</button><span className="modal-spacer" /><button type="button" className="plain-button" onClick={() => setModalMode('edit')}>Edit booking</button></div> : <div className="modal-foot"><button type="button" className="plain-button" onClick={() => setModalMode(null)}>Cancel</button><button type="submit" className="primary-button">{modalMode === 'edit' ? 'Save changes' : 'Confirm booking'}</button></div>}</form></div>}
    </main>
  );
}
