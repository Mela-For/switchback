import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
// Deep per-icon imports (not the package's top-level barrel): Metro doesn't
// tree-shake in dev mode, so importing from 'lucide-react-native' directly
// would bundle all ~1750 icons instead of just the ones this app uses.
import Accessibility from 'lucide-react-native/icons/accessibility';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Backpack from 'lucide-react-native/icons/backpack';
import Bed from 'lucide-react-native/icons/bed';
import Bell from 'lucide-react-native/icons/bell';
import Bike from 'lucide-react-native/icons/bike';
import Book from 'lucide-react-native/icons/book';
import BookOpen from 'lucide-react-native/icons/book-open';
import Bookmark from 'lucide-react-native/icons/bookmark';
import Bus from 'lucide-react-native/icons/bus';
import Calendar from 'lucide-react-native/icons/calendar';
import Camera from 'lucide-react-native/icons/camera';
import Car from 'lucide-react-native/icons/car';
import Check from 'lucide-react-native/icons/check';
import Coffee from 'lucide-react-native/icons/coffee';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Circle from 'lucide-react-native/icons/circle';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CirclePlus from 'lucide-react-native/icons/circle-plus';
import CircleX from 'lucide-react-native/icons/circle-x';
import Clock from 'lucide-react-native/icons/clock';
import Compass from 'lucide-react-native/icons/compass';
import Copy from 'lucide-react-native/icons/copy';
import Download from 'lucide-react-native/icons/download';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical';
import ExternalLink from 'lucide-react-native/icons/external-link';
import Flag from 'lucide-react-native/icons/flag';
import Footprints from 'lucide-react-native/icons/footprints';
import Heart from 'lucide-react-native/icons/heart';
import Image from 'lucide-react-native/icons/image';
import Images from 'lucide-react-native/icons/images';
import Info from 'lucide-react-native/icons/info';
import Landmark from 'lucide-react-native/icons/landmark';
import Link from 'lucide-react-native/icons/link';
import ListFilter from 'lucide-react-native/icons/list-filter';
import LogIn from 'lucide-react-native/icons/log-in';
import LogOut from 'lucide-react-native/icons/log-out';
import Lock from 'lucide-react-native/icons/lock';
import Mail from 'lucide-react-native/icons/mail';
import Map from 'lucide-react-native/icons/map';
import MapPin from 'lucide-react-native/icons/map-pin';
import Maximize from 'lucide-react-native/icons/maximize';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Mountain from 'lucide-react-native/icons/mountain';
import Navigation from 'lucide-react-native/icons/navigation';
import Paperclip from 'lucide-react-native/icons/paperclip';
import Pen from 'lucide-react-native/icons/pen';
import Phone from 'lucide-react-native/icons/phone';
import Plane from 'lucide-react-native/icons/plane';
import Plus from 'lucide-react-native/icons/plus';
import Route from 'lucide-react-native/icons/route';
import Search from 'lucide-react-native/icons/search';
import Send from 'lucide-react-native/icons/send';
import Settings2 from 'lucide-react-native/icons/settings-2';
import Share2 from 'lucide-react-native/icons/share-2';
import ShoppingBag from 'lucide-react-native/icons/shopping-bag';
import Signpost from 'lucide-react-native/icons/signpost';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Snowflake from 'lucide-react-native/icons/snowflake';
import Square from 'lucide-react-native/icons/square';
import SquareCheck from 'lucide-react-native/icons/square-check';
import SquarePen from 'lucide-react-native/icons/square-pen';
import Star from 'lucide-react-native/icons/star';
import StarHalf from 'lucide-react-native/icons/star-half';
import Tent from 'lucide-react-native/icons/tent';
import Ticket from 'lucide-react-native/icons/ticket';
import Trash from 'lucide-react-native/icons/trash';
import Trash2 from 'lucide-react-native/icons/trash-2';
import Trees from 'lucide-react-native/icons/trees';
import Umbrella from 'lucide-react-native/icons/umbrella';
import Upload from 'lucide-react-native/icons/upload';
import User from 'lucide-react-native/icons/user';
import UserPlus from 'lucide-react-native/icons/user-plus';
import Users from 'lucide-react-native/icons/users';
import Utensils from 'lucide-react-native/icons/utensils';
import Wine from 'lucide-react-native/icons/wine';
import X from 'lucide-react-native/icons/x';
import { colors } from '../../constants/theme';

/**
 * Registry of Lucide icons used across the app, keyed by the kebab-case
 * names used throughout the Switchback Design System (guidelines, prompt
 * files, mockups). Grow this list — with a matching deep import above — as
 * new icons are needed during screen conversion; don't switch back to
 * importing from the package's top-level barrel (see note above).
 */
const REGISTRY = {
  accessibility: Accessibility,
  'arrow-up': ArrowUp,
  backpack: Backpack,
  bed: Bed,
  bell: Bell,
  bike: Bike,
  book: Book,
  'book-open': BookOpen,
  bookmark: Bookmark,
  bus: Bus,
  calendar: Calendar,
  camera: Camera,
  car: Car,
  check: Check,
  coffee: Coffee,
  'circle-check': CircleCheck,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  circle: Circle,
  'circle-alert': CircleAlert,
  'circle-plus': CirclePlus,
  'circle-x': CircleX,
  clock: Clock,
  compass: Compass,
  copy: Copy,
  download: Download,
  ellipsis: Ellipsis,
  'ellipsis-vertical': EllipsisVertical,
  'external-link': ExternalLink,
  flag: Flag,
  footprints: Footprints,
  heart: Heart,
  image: Image,
  images: Images,
  info: Info,
  landmark: Landmark,
  link: Link,
  'list-filter': ListFilter,
  'log-in': LogIn,
  'log-out': LogOut,
  lock: Lock,
  mail: Mail,
  map: Map,
  'map-pin': MapPin,
  maximize: Maximize,
  'message-circle': MessageCircle,
  mountain: Mountain,
  navigation: Navigation,
  paperclip: Paperclip,
  pen: Pen,
  phone: Phone,
  plane: Plane,
  plus: Plus,
  route: Route,
  search: Search,
  send: Send,
  'settings-2': Settings2,
  'share-2': Share2,
  'shopping-bag': ShoppingBag,
  signpost: Signpost,
  'sliders-horizontal': SlidersHorizontal,
  snowflake: Snowflake,
  square: Square,
  'square-check': SquareCheck,
  'square-pen': SquarePen,
  star: Star,
  'star-half': StarHalf,
  tent: Tent,
  ticket: Ticket,
  trash: Trash,
  'trash-2': Trash2,
  trees: Trees,
  umbrella: Umbrella,
  upload: Upload,
  user: User,
  'user-plus': UserPlus,
  users: Users,
  utensils: Utensils,
  wine: Wine,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof REGISTRY;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color = colors.textPrimary, strokeWidth = 2 }: IconProps) {
  const LucideIconComponent = REGISTRY[name];
  return <LucideIconComponent size={size} color={color} strokeWidth={strokeWidth} />;
}
