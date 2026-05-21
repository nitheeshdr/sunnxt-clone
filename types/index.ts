export interface ContentImage {
  type: string;
  profile: string;
  resolution: string;
  link: string;
  operator?: string;
}

export interface ContentImages {
  values: ContentImage[];
}

export interface CastMember {
  _id: string;
  types: string[];
  name: string;
  roles: string[];
  images: ContentImages;
}

export interface GeneralInfo {
  _id: string;
  type: "vod" | "live" | "music" | "shorts" | "movie" | "episode" | "tvSeries" | "musicvideo" | "show" | string;
  title: string;
  category: string;
  isSellable: boolean;
  isDownloadable: boolean;
  videoAvailable: boolean;
  briefDescription: string;
  description: string;
  isDolby?: boolean;
  displayTitle?: string;
  bottomCenterLabel?: string;
  heroBannerLabelText?: string;
  categoryTypeImage?: string;
  videoQualityImage?: string;
  altLanguage?: string;
}

export interface ContentItem {
  _id: string;
  title: string;
  altTitle: Array<{ language: string; title: string }>;
  releaseDate: string;
  startDate: string;
  endDate: string;
  globalServiceName?: string;
  globalServiceId?: string;
  generalInfo: GeneralInfo;
  images: ContentImages;
  genreInfo?: { values: Array<{ title: string }> };
  language?: string;
  year?: string;
  duration?: string;
  rating?: string;
  relatedCast?: { values: CastMember[] };
  subtitles?: { values: Array<{ language: string; link_sub: string }> };
}

export interface CarouselSection {
  name: string;
  title: string;
  analyticalTitle: string;
  layoutType: string;
  enableShowTitle: boolean;
  enableShowAll: boolean;
  showAll: string;
  pageSize: number;
  playlist: string;
  weightage: number;
  actionUrl?: string;
  images: ContentImage[];
}

export interface NavMenuItem {
  name: string;
  title: string;
  actionUrl: string;
  layoutType: string;
  images: ContentImage[];
}

export interface UserProfile {
  _id: number;
  first: string;
  last: string;
  mobile_no: string;
  profilePicture?: string;
  languages: string[];
  subscriptionStatus: string;
  partner_name?: string;
  country?: string;
}

export interface ApiResponse<T> {
  code: number;
  status: string;
  message: string;
  results?: T;
  result?: T;
}
