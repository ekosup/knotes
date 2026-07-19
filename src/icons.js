/**
 * Tabler Icons — inline SVG helper.
 * Each icon is imported as raw SVG string and rendered via `icon(name)`.
 */
import IconPlus from '@tabler/icons/outline/plus.svg?raw';
import IconTrash from '@tabler/icons/outline/trash.svg?raw';
import IconFileDownload from '@tabler/icons/outline/file-download.svg?raw';
import IconFileExport from '@tabler/icons/outline/file-export.svg?raw';
import IconFileImport from '@tabler/icons/outline/file-import.svg?raw';
import IconSun from '@tabler/icons/outline/sun.svg?raw';
import IconMoon from '@tabler/icons/outline/moon.svg?raw';
import IconGripVertical from '@tabler/icons/outline/grip-vertical.svg?raw';
import IconCloudOff from '@tabler/icons/outline/cloud-off.svg?raw';
import IconChevronDown from '@tabler/icons/outline/chevron-down.svg?raw';
import IconNotes from '@tabler/icons/outline/notes.svg?raw';
import IconSearch from '@tabler/icons/outline/search.svg?raw';
import IconX from '@tabler/icons/outline/x.svg?raw';
import IconLoader from '@tabler/icons/outline/loader-2.svg?raw';
import IconCheck from '@tabler/icons/outline/check.svg?raw';
import IconPin from '@tabler/icons/outline/pin.svg?raw';
import IconPinned from '@tabler/icons/outline/pinned.svg?raw';
import IconTag from '@tabler/icons/outline/tag.svg?raw';
import IconMaximize from '@tabler/icons/outline/arrows-maximize.svg?raw';
import IconMinimize from '@tabler/icons/outline/arrows-minimize.svg?raw';
import IconEye from '@tabler/icons/outline/eye.svg?raw';
import IconEyeOff from '@tabler/icons/outline/eye-off.svg?raw';
import IconChevronLeft from '@tabler/icons/outline/chevron-left.svg?raw';
import IconChevronRight from '@tabler/icons/outline/chevron-right.svg?raw';
import IconChevronUp from '@tabler/icons/outline/chevron-up.svg?raw';
import IconPresentation from '@tabler/icons/outline/presentation.svg?raw';
import IconList from '@tabler/icons/outline/list.svg?raw';

import IconZoomIn from '@tabler/icons/outline/zoom-in.svg?raw';
import IconZoomOut from '@tabler/icons/outline/zoom-out.svg?raw';

const icons = {
  plus: IconPlus,
  trash: IconTrash,
  'file-download': IconFileDownload,
  'file-export': IconFileExport,
  'file-import': IconFileImport,
  sun: IconSun,
  moon: IconMoon,
  'grip-vertical': IconGripVertical,
  'cloud-off': IconCloudOff,
  'chevron-down': IconChevronDown,
  notes: IconNotes,
  search: IconSearch,
  x: IconX,
  loader: IconLoader,
  check: IconCheck,
  pin: IconPin,
  'pin-filled': IconPinned,
  tag: IconTag,
  maximize: IconMaximize,
  minimize: IconMinimize,
  eye: IconEye,
  'eye-off': IconEyeOff,
  'chevron-left': IconChevronLeft,
  'chevron-right': IconChevronRight,
  'chevron-up': IconChevronUp,
  presentation: IconPresentation,
  list: IconList,
  'zoom-in': IconZoomIn,
  'zoom-out': IconZoomOut,
};

/**
 * Render an icon by name. Returns SVG string.
 * Usage: element.innerHTML = icon('plus');
 */
export function icon(name) {
  return icons[name] || '';
}

/**
 * Create an <i> element wrapping the icon SVG.
 */
export function iconEl(name, className = '') {
  const span = document.createElement('span');
  span.className = 'icon ' + className;
  span.innerHTML = icon(name);
  return span;
}
