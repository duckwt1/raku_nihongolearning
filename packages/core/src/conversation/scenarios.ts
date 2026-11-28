import { KANJI_BY_CHAR, SEED_WORDS } from '../data/index.js';
import { createNewCard } from '../fsrs/scheduler.js';
import type { StudyCard } from '../fsrs/studySession.js';
import type { JlptLevel } from '../models/schemas.js';
import { normalizeJapaneseSurface, normalizeKana } from '../text/normalize.js';
import type {
  ConversationScenario,
  PolitenessLevel,
  PracticeTargetWord,
  SavedPhraseCandidate
} from './schemas.js';

export const POLITENESS_LABELS: Record<PolitenessLevel, { label: string; jp: string; desc: string }> = {
  any: {
    label: 'Tự do',
    jp: '自由',
    desc: 'Tự chọn cách nói thân mật, lịch sự hay kính ngữ tuỳ ý'
  },
  casual: {
    label: 'Thân mật',
    jp: 'ため口・普通形',
    desc: 'Dùng với bạn bè, người thân cùng trang lứa'
  },
  polite: {
    label: 'Lịch sự',
    jp: 'です・ます',
    desc: 'Dùng hàng ngày với người mới quen, đồng nghiệp, cửa hàng'
  },
  keigo: {
    label: 'Kính ngữ',
    jp: '敬語',
    desc: 'Dùng với cấp trên, khách hàng, phỏng vấn công sở'
  }
};

export const CONVERSATION_CATEGORY_LABELS: Record<ConversationScenario['category'], string> = {
  daily: 'Đời sống',
  dining: 'Ăn uống',
  travel: 'Di chuyển',
  health: 'Sức khỏe',
  campus: 'Bạn bè & Học tập',
  work: 'Công việc',
  custom: 'Tự tạo'
};

export const BUILTIN_CONVERSATION_SCENARIOS: ConversationScenario[] = [
  // N5
  {
    id: 'scn_n5_ramen',
    titleVi: 'Gọi món ở quán Ramen',
    titleJp: 'ラーメン屋で注文する',
    jlpt: 'N5',
    category: 'dining',
    politeness: 'polite',
    aiRoleVi: 'Nhân viên quán ramen',
    aiRoleJp: 'ラーメン屋の店員',
    userRoleVi: 'Khách hàng',
    settingVi: 'Bạn vừa bước vào một quán ramen địa phương vào buổi trưa và muốn gọi món ít cay.',
    missions: [
      { id: 'm1', titleVi: 'Chào và báo đi 1 người', hintJp: 'ひとりです' },
      { id: 'm2', titleVi: 'Gọi 1 bát ramen và hỏi món nào không cay', hintJp: 'からくないラーメンはどれですか' },
      { id: 'm3', titleVi: 'Xin thanh toán sau khi ăn xong', hintJp: 'おかいけいをおねがいします' }
    ],
    starterJp: 'いらっしゃいませ！何名様ですか？',
    starterReading: 'いらっしゃいませ！なんめいさまですか？',
    starterVi: 'Xin chào quý khách! Quý khách đi mấy người ạ?'
  },
  {
    id: 'scn_n5_station',
    titleVi: 'Hỏi đường tới ga tàu',
    titleJp: '駅への道を聞く',
    jlpt: 'N5',
    category: 'travel',
    politeness: 'polite',
    aiRoleVi: 'Người qua đường thân thiện',
    aiRoleJp: '親切な通行人',
    userRoleVi: 'Khách du lịch đang tìm ga Shinjuku',
    settingVi: 'Bạn đang đứng gần giao lộ và muốn hỏi đường đi bộ tới ga tàu gần nhất.',
    missions: [
      { id: 'm1', titleVi: 'Bắt chuyện lịch sự và hỏi đường tới ga', hintJp: 'すみません、えきはどこですか' },
      { id: 'm2', titleVi: 'Hỏi đi bộ mất khoảng bao nhiêu phút', hintJp: 'あるいてなんぷんくらいかかりますか' },
      { id: 'm3', titleVi: 'Cảm ơn người chỉ đường', hintJp: 'ありがとうございます' }
    ],
    starterJp: 'はい、どうしましたか？何かお探しですか？',
    starterReading: 'はい、どうしましたか？なにかおさがしですか？',
    starterVi: 'Vâng, có chuyện gì thế ạ? Bạn đang tìm gì à?'
  },
  {
    id: 'scn_n5_classmate',
    titleVi: 'Làm quen bạn mới cùng lớp',
    titleJp: 'クラスメートと自己紹介',
    jlpt: 'N5',
    category: 'campus',
    politeness: 'casual',
    aiRoleVi: 'Bạn cùng lớp người Nhật (Yuki)',
    aiRoleJp: 'クラスメートのユキ',
    userRoleVi: 'Du học sinh mới chuyển tới',
    settingVi: 'Giờ ra chơi đầu tiên, Yuki ngồi cạnh bạn bắt chuyện làm quen bằng giọng thân mật.',
    missions: [
      { id: 'm1', titleVi: 'Giới thiệu tên và quê quán của bạn', hintJp: 'ベトナムからきた〜だよ' },
      { id: 'm2', titleVi: 'Chia sẻ 1 sở thích của bản thân', hintJp: 'しゅみは〜だよ' },
      { id: 'm3', titleVi: 'Hỏi lại sở thích hoặc món ăn yêu thích của Yuki', hintJp: 'ユキはなにがすき？' }
    ],
    starterJp: 'ねえねえ、初めまして！ユキだよ。どこから来たの？',
    starterReading: 'ねえねえ、はじめまして！ユキだよ。どこからきたの？',
    starterVi: 'Này, rất vui được gặp bạn! Mình là Yuki. Cậu từ đâu đến thế?'
  },

  // N4
  {
    id: 'scn_n4_pharmacy',
    titleVi: 'Mua thuốc cảm ở hiệu thuốc',
    titleJp: '薬局で風邪薬を買う',
    jlpt: 'N4',
    category: 'health',
    politeness: 'polite',
    aiRoleVi: 'Dược sĩ tại hiệu thuốc',
    aiRoleJp: '薬局の薬剤師',
    userRoleVi: 'Khách bị đau họng và hơi sốt',
    settingVi: 'Bạn bị cảm nhẹ từ hôm qua, ghé hiệu thuốc nhờ dược sĩ tư vấn loại thuốc không gây buồn ngủ.',
    missions: [
      { id: 'm1', titleVi: 'Mô tả triệu chứng (đau họng / hơi sốt / ho)', hintJp: 'きのうからのどがいたくて…' },
      { id: 'm2', titleVi: 'Hỏi loại thuốc không gây buồn ngủ', hintJp: 'ねむくならないくすりはありますか' },
      { id: 'm3', titleVi: 'Hỏi cách uống (ngày mấy lần, trước hay sau ăn)', hintJp: 'いちにちになんかいのめばいいですか' }
    ],
    starterJp: 'こんにちは。今日はどのような症状でお困りですか？',
    starterReading: 'こんにちは。きょうはどのようなしょうじょうでおこまりですか？',
    starterVi: 'Xin chào. Hôm nay bạn đang gặp triệu chứng nào vậy?'
  },
  {
    id: 'scn_n4_exchange',
    titleVi: 'Đổi size áo tại cửa hàng',
    titleJp: '服のサイズを交換する',
    jlpt: 'N4',
    category: 'daily',
    politeness: 'polite',
    aiRoleVi: 'Nhân viên cửa hàng quần áo',
    aiRoleJp: '服屋の店員',
    userRoleVi: 'Khách muốn đổi áo sang size lớn hơn',
    settingVi: 'Hôm qua bạn mua 1 chiếc áo size M nhưng mặc hơi chật, hôm nay mang hóa đơn quay lại đổi sang size L.',
    missions: [
      { id: 'm1', titleVi: 'Trình bày muốn đổi size áo vừa mua hôm qua', hintJp: 'きのうかったシャツをこうかんしたいんですが' },
      { id: 'm2', titleVi: 'Giải thích lý do (hơi chật) và hỏi có size L không', hintJp: 'ちょっときつくて、Lサイズはありますか' },
      { id: 'm3', titleVi: 'Xác nhận mang theo hóa đơn và cảm ơn', hintJp: 'レシートはこちらです' }
    ],
    starterJp: 'いらっしゃいませ。ご用件をお伺いいたします。',
    starterReading: 'いらっしゃいませ。ごようけんをおうかがいいたします。',
    starterVi: 'Xin chào quý khách. Tôi có thể giúp gì cho quý khách ạ?'
  },
  {
    id: 'scn_n4_weekend',
    titleVi: 'Rủ bạn đi chơi cuối tuần',
    titleJp: '週末の遊びに誘う',
    jlpt: 'N4',
    category: 'campus',
    politeness: 'casual',
    aiRoleVi: 'Bạn thân (Kenji)',
    aiRoleJp: '友達のケンジ',
    userRoleVi: 'Bạn muốn rủ Kenji đi xem phim hoặc đi café',
    settingVi: 'Cuối tuần này bạn rảnh, muốn rủ Kenji đi đâu đó và thống nhất giờ, địa điểm hẹn.',
    missions: [
      { id: 'm1', titleVi: 'Hỏi cuối tuần này Kenji có bận không', hintJp: 'こんしゅうまつ、あいてる？' },
      { id: 'm2', titleVi: 'Đề xuất 1 hoạt động (xem phim, ăn uống, café...)', hintJp: 'いっしょにえいがをみにいかない？' },
      { id: 'm3', titleVi: 'Chốt giờ và địa điểm gặp nhau', hintJp: 'じゃ、じゅういちじにえきのまえで！' }
    ],
    starterJp: 'おっ、お疲れ！今週もやっと終わりそうだね。週末なにか予定ある？',
    starterReading: 'おっ、おつかれ！こんしゅうもやっとおわりそうだね。しゅうまつなにかよていある？',
    starterVi: 'Ồ, vất vả rồi! Tuần này cũng sắp hết rồi nhỉ. Cuối tuần cậu có dự định gì không?'
  },

  // N3
  {
    id: 'scn_n3_apartment',
    titleVi: 'Tìm thuê phòng trọ ở Nhật',
    titleJp: '不動産屋で部屋を探す',
    jlpt: 'N3',
    category: 'daily',
    politeness: 'polite',
    aiRoleVi: 'Nhân viên môi giới bất động sản',
    aiRoleJp: '不動産会社の担当者',
    userRoleVi: 'Người nước ngoài tìm thuê căn hộ 1K gần ga',
    settingVi: 'Bạn đến công ty bất động sản tìm phòng gần ga, ngân sách khoảng 7 man/tháng và muốn hỏi về chi phí đầu vào.',
    missions: [
      { id: 'm1', titleVi: 'Nêu điều kiện phòng (tiền thuê, khoảng cách tới ga)', hintJp: 'やちんは7まんえんいないで、えきからちかいへやがいいです' },
      { id: 'm2', titleVi: 'Hỏi về tiền đặt cọc / tiền lễ (敷金・礼金) hoặc nội thất', hintJp: 'しききんやれいきんはかかりますか' },
      { id: 'm3', titleVi: 'Đặt lịch đi xem phòng thực tế (内見)', hintJp: 'らいしゅうないけんできますか' }
    ],
    starterJp: 'ご来店ありがとうございます。どのような条件でお部屋をお探しでしょうか？',
    starterReading: 'ごらいてんありがとうございます。どのようなじょうけんでおへやをおさがしでしょうか？',
    starterVi: 'Cảm ơn quý khách đã ghé thăm. Quý khách đang tìm phòng với điều kiện như thế nào ạ?'
  },
  {
    id: 'scn_n3_baito',
    titleVi: 'Phỏng vấn xin việc làm thêm (Baito)',
    titleJp: 'アルバイトの面接',
    jlpt: 'N3',
    category: 'work',
    politeness: 'polite',
    aiRoleVi: 'Quản lý quán cà phê (Tenchou)',
    aiRoleJp: 'カフェの店長',
    userRoleVi: 'Ứng viên xin làm thêm bán thời gian',
    settingVi: 'Bạn đang phỏng vấn xin làm nhân viên bán thời gian tại một quán cà phê gần trường.',
    missions: [
      { id: 'm1', titleVi: 'Nêu lý do muốn làm việc tại quán', hintJp: 'せっきゃくにきょうみがあって、おうぼしました' },
      { id: 'm2', titleVi: 'Trả lời số buổi có thể làm mỗi tuần và khung giờ', hintJp: 'しゅうにさんかい、ごごからはいれます' },
      { id: 'm3', titleVi: 'Đặt 1 câu hỏi lại cho quản lý về ca làm hoặc đào tạo', hintJp: 'けんしゅうきかんはどのくらいありますか' }
    ],
    starterJp: '本日はお越しいただきありがとうございます。まずは簡単に自己紹介と、応募した理由を教えていただけますか？',
    starterReading: 'ほんじつはおこしいただきありがとうございます。まずはかんたんにじこしょうかいと、おうぼしたりゆうをおしえていただけますか？',
    starterVi: 'Cảm ơn bạn hôm nay đã đến. Trước hết bạn có thể giới thiệu ngắn gọn về bản thân và lý do ứng tuyển không?'
  },
  {
    id: 'scn_n3_colleague',
    titleVi: 'Nhờ đồng nghiệp hướng dẫn công việc',
    titleJp: '同僚に仕事のやり方を聞く',
    jlpt: 'N3',
    category: 'work',
    politeness: 'polite',
    aiRoleVi: 'Đồng nghiệp tiền bối (Sato)',
    aiRoleJp: '先輩社員の佐藤',
    userRoleVi: 'Nhân viên mới đang gặp vướng mắc với báo cáo',
    settingVi: 'Bạn mới vào nhóm và chưa rõ quy trình gửi báo cáo cuối ngày, muốn nhờ anh Sato chỉ giúp.',
    missions: [
      { id: 'm1', titleVi: 'Hỏi lịch sự xem anh Sato có rảnh vài phút không', hintJp: 'いま、すこしおじかんよろしいでしょうか' },
      { id: 'm2', titleVi: 'Nêu cụ thể điểm chưa hiểu trong quy trình', hintJp: 'にっぽうのだしかたがよくわからなくて…' },
      { id: 'm3', titleVi: 'Nhắc lại để xác nhận đã hiểu và cảm ơn', hintJp: 'つまり〜ということですね。ありがとうございます' }
    ],
    starterJp: 'お疲れさま！何か困っていることある？',
    starterReading: 'おつかれさま！なにかこまっていることある？',
    starterVi: 'Vất vả rồi! Bạn đang gặp khó khăn gì à?'
  },

  // N2
  {
    id: 'scn_n2_horenso',
    titleVi: 'Báo cáo sự cố tiến độ với sếp (Horenso)',
    titleJp: '上司に進捗の遅れを報告・相談する',
    jlpt: 'N2',
    category: 'work',
    politeness: 'keigo',
    aiRoleVi: 'Trưởng phòng (Tanaka Buchou)',
    aiRoleJp: '田中部長',
    userRoleVi: 'Nhân viên phụ trách dự án bị chậm 1 ngày',
    settingVi: 'Tính năng bạn phụ trách phát sinh lỗi bất ngờ nên có nguy cơ trễ deadline 1 ngày. Bạn cần báo cáo sớm và đề xuất phương án xử lý với trưởng phòng.',
    missions: [
      { id: 'm1', titleVi: 'Xin phép báo cáo và nói thẳng kết luận (nguy cơ trễ 1 ngày)', hintJp: 'ごほうこくしたいことがございます。のうきが1にちおくれそうです' },
      { id: 'm2', titleVi: 'Giải thích nguyên nhân ngắn gọn và khách quan', hintJp: 'テストのさいにふぐあいがみつかりまして…' },
      { id: 'm3', titleVi: 'Đề xuất giải pháp khắc phục và xin ý kiến sếp', hintJp: '〜でたいおうしたいとかんがえておりますが、いかがでしょうか' }
    ],
    starterJp: 'お疲れさまです。ちょうど今少し時間がありますよ。プロジェクトの件でしょうか？',
    starterReading: 'おつかれさまです。ちょうどいますこしじかんがありますよ。プロジェクトのけんでしょうか？',
    starterVi: 'Vất vả rồi. Đúng lúc tôi đang rảnh một chút đây. Về chuyện dự án đúng không?'
  },
  {
    id: 'scn_n2_it_interview',
    titleVi: 'Phỏng vấn kỹ sư IT tại công ty Nhật',
    titleJp: 'ITエンジニアの中途面接',
    jlpt: 'N2',
    category: 'work',
    politeness: 'keigo',
    aiRoleVi: 'Trưởng nhóm kỹ thuật phỏng vấn',
    aiRoleJp: '開発チームの面接官',
    userRoleVi: 'Ứng viên kỹ sư phần mềm',
    settingVi: 'Buổi phỏng vấn vòng kỹ thuật với trưởng nhóm phát triển tại một công ty công nghệ ở Tokyo.',
    missions: [
      { id: 'm1', titleVi: 'Trình bày kinh nghiệm dự án tiêu biểu gần nhất', hintJp: 'これまでWebアプリのかいはつをたんとうしてまいりました' },
      { id: 'm2', titleVi: 'Chia sẻ 1 khó khăn kỹ thuật từng vượt qua', hintJp: 'せいのうのかいぜんにくろうしましたが…' },
      { id: 'm3', titleVi: 'Đặt câu hỏi sâu về văn hóa làm việc hoặc quy trình phát triển của team', hintJp: 'チームのかいはつたいせいについておうかがいできますでしょうか' }
    ],
    starterJp: '本日は面接にお時間いただきありがとうございます。まずはこれまでのご経歴と、得意な技術領域についてお聞かせいただけますか？',
    starterReading: 'ほんじつはめんせつにおじかんいただきありがとうございます。まずはこれまでのごけいれきと、とくいなぎじゅつりょういきについておきかせいただけますか？',
    starterVi: 'Cảm ơn bạn đã dành thời gian phỏng vấn hôm nay. Trước hết bạn có thể chia sẻ về quá trình làm việc và mảng kỹ thuật thế mạnh của mình không?'
  },

  // N1
  {
    id: 'scn_n1_negotiation',
    titleVi: 'Đàm phán điều chỉnh lịch giao hàng với khách',
    titleJp: '取引先との納期調整交渉',
    jlpt: 'N1',
    category: 'work',
    politeness: 'keigo',
    aiRoleVi: 'Đại diện đối tác Nhật Bản (Yamada-sama)',
    aiRoleJp: '取引先の山田様',
    userRoleVi: 'Quản lý dự án phía cung cấp giải pháp',
    settingVi: 'Khách hàng yêu cầu bổ sung tính năng gấp nhưng giữ nguyên ngày ra mắt. Bạn cần thương lượng khéo léo bằng kính ngữ để tách giai đoạn (Phase 1 / Phase 2) mà vẫn giữ thiện cảm.',
    missions: [
      { id: 'm1', titleVi: 'Thể hiện sự thấu hiểu yêu cầu và cam kết chất lượng', hintJp: 'ごようぼうのしゅしはじゅうぶんしょうちいたしました' },
      { id: 'm2', titleVi: 'Trình bày rủi ro chất lượng nếu dồn toàn bộ vào lịch cũ', hintJp: 'ひんしつをたんぽするためには、テストきかんがふそくするおそれがございます' },
      { id: 'm3', titleVi: 'Đề xuất lộ trình 2 giai đoạn và xin xác nhận từ đối tác', hintJp: 'だいいちフェーズでひっすきのうをリリースするあんはいかがでしょうか' }
    ],
    starterJp: 'お忙しいところ恐れ入ります。先ほどお送りした追加要件ですが、当初のリリース日に間に合わせていただくことは可能でしょうか？',
    starterReading: 'おいそがしいところおそれいります。さきほどおおくりしたついかりょうけんですが、とうしょのリリースびにまにあわせていただくことはかのうでしょうか？',
    starterVi: 'Xin lỗi đã làm phiền lúc bận rộn. Về yêu cầu bổ sung tôi vừa gửi lúc nãy, phía anh/chị có thể hoàn thành kịp ngày phát hành ban đầu không?'
  }
];

/**
 * Extracts Kanji characters and looks up their Han-Viet meanings from SEED_KANJI.
 */
export function extractKanjiAndHanViet(surface: string): {
  kanji: string[];
  hanVietBreakdown: string[];
} {
  const matched = surface.match(/[\u4E00-\u9FAF\u3400-\u4DBF]/g) || [];
  const kanji: string[] = [];
  const hanVietBreakdown: string[] = [];

  for (const ch of matched) {
    kanji.push(ch);
    const info = KANJI_BY_CHAR.get(ch);
    if (info && info.hanViet.length > 0 && info.hanViet[0]) {
      hanVietBreakdown.push(info.hanViet[0].toUpperCase());
    }
  }
  return { kanji, hanVietBreakdown };
}

/**
 * Picks target vocabulary for active output practice from user's FSRS cards.
 * Prioritizes weak/lapsed words (lapses > 0), then recently reviewed words,
 * then other words in the chosen deck / JLPT level, falling back to SEED_WORDS.
 */
export function pickTargetWordsForPractice(
  cards: StudyCard[],
  options: {
    deckId?: string;
    jlpt?: JlptLevel;
    count?: number;
    excludeSurfaces?: string[];
  } = {}
): PracticeTargetWord[] {
  const count = Math.min(Math.max(options.count ?? 3, 1), 8);
  const excluded = new Set((options.excludeSurfaces || []).map(normalizeJapaneseSurface));

  const wordCards = cards.filter((c) => {
    if (c.type !== 'word' || !c.word?.surface) return false;
    if (options.deckId && options.deckId !== 'all' && c.deckId !== options.deckId) return false;
    if (options.jlpt && c.word.jlpt && c.word.jlpt !== options.jlpt && !options.deckId) return false;
    if (excluded.has(normalizeJapaneseSurface(c.word.surface))) return false;
    return true;
  });

  // Sort by priority: lapsed cards -> due cards -> studied cards -> new cards
  const scored = wordCards.map((card) => {
    const lapses = card.fsrsCard?.lapses ?? 0;
    const reps = card.fsrsCard?.reps ?? 0;
    let priority = 0;
    if (lapses > 0) priority += 100 + Math.min(lapses * 10, 50);
    if (card.isDue) priority += 40;
    if (reps > 0) priority += 20;
    // Slight deterministic-ish jitter to avoid repeating the exact same 3 cards
    const jitter = Math.random() * 15;
    return { card, score: priority + jitter };
  });

  scored.sort((a, b) => b.score - a.score);

  const result: PracticeTargetWord[] = [];
  const seenSurfaces = new Set<string>(excluded);

  for (const entry of scored) {
    if (result.length >= count) break;
    const w = entry.card.word;
    if (!w) continue;
    const norm = normalizeJapaneseSurface(w.surface);
    if (!norm || seenSurfaces.has(norm)) continue;
    seenSurfaces.add(norm);
    result.push({
      cardId: entry.card.id,
      surface: w.surface,
      reading: w.readings[0] || w.surface,
      meaningVi: w.meaningVi
    });
  }

  // Fallback to SEED_WORDS if user's filtered deck didn't have enough words
  if (result.length < count) {
    const pool = [...SEED_WORDS].sort(() => Math.random() - 0.5);
    for (const w of pool) {
      if (result.length >= count) break;
      const norm = normalizeJapaneseSurface(w.surface);
      if (!norm || seenSurfaces.has(norm)) continue;
      seenSurfaces.add(norm);
      result.push({
        surface: w.surface,
        reading: w.readings[0] || w.surface,
        meaningVi: w.meaningVi
      });
    }
  }

  return result;
}

const CONJUGABLE_ENDINGS = /[るうくぐすつぬぶむい]$/;

/**
 * Lightweight client-side stem matcher for real-time highlighting of target words
 * while the user is typing (handles basic verb/adjective conjugations and kana input).
 */
export function matchTargetWordsLive(
  inputText: string,
  targetWords: PracticeTargetWord[]
): string[] {
  const cleanSurface = normalizeJapaneseSurface(inputText);
  const cleanKana = normalizeKana(inputText);
  if (!cleanSurface && !cleanKana) return [];

  const matched: string[] = [];

  for (const word of targetWords) {
    const normSurf = normalizeJapaneseSurface(word.surface);
    const normReading = normalizeKana(word.reading);

    if (!normSurf) continue;

    // 1. Direct surface or reading match
    if (cleanSurface.includes(normSurf) || (normReading.length >= 2 && cleanKana.includes(normReading))) {
      matched.push(word.surface);
      continue;
    }

    // 2. Conjugation stem match (strip final dictionary okurigana if stem >= 1 kanji or >= 2 chars)
    if (normSurf.length >= 2 && CONJUGABLE_ENDINGS.test(normSurf)) {
      const stem = normSurf.slice(0, -1);
      const hasKanji = /[\u4E00-\u9FAF]/.test(stem);
      if ((hasKanji && stem.length >= 1) || stem.length >= 2) {
        if (cleanSurface.includes(stem)) {
          matched.push(word.surface);
          continue;
        }
      }
    }

    if (normReading.length >= 3 && CONJUGABLE_ENDINGS.test(normReading)) {
      const kanaStem = normReading.slice(0, -1);
      if (kanaStem.length >= 2 && cleanKana.includes(kanaStem)) {
        matched.push(word.surface);
      }
    }
  }

  return matched;
}

/**
 * Checks whether a phrase with the same normalized surface already exists in the target deck.
 */
export function isDuplicatePhraseInDeck(
  surface: string,
  deckId: string,
  existingCards: StudyCard[]
): boolean {
  const target = normalizeJapaneseSurface(surface);
  if (!target) return false;
  return existingCards.some(
    (card) =>
      card.deckId === deckId &&
      card.type === 'word' &&
      card.word?.surface &&
      normalizeJapaneseSurface(card.word.surface) === target
  );
}

/**
 * Builds a complete StudyCard (FSRS + auto Han-Viet breakdown) from an AI-suggested phrase.
 */
export function buildCustomStudyCardFromPhrase(
  phrase: SavedPhraseCandidate,
  deckId: string
): StudyCard {
  const now = Date.now();
  const suffix = Math.random().toString(36).slice(2, 6);
  const wordId = `w_conv_${now}_${suffix}`;
  const cardId = `c_word_conv_${now}_${suffix}`;

  const { kanji, hanVietBreakdown } = extractKanjiAndHanViet(phrase.surface);
  const manualHanViet = phrase.hanViet
    ? phrase.hanViet
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => s.toUpperCase())
    : [];

  return {
    id: cardId,
    type: 'word',
    refId: wordId,
    word: {
      id: wordId,
      surface: phrase.surface.trim(),
      readings: [phrase.reading.trim() || phrase.surface.trim()],
      meaningVi: phrase.meaningVi.trim(),
      pos: phrase.pos?.trim() || '表現',
      kanji,
      hanVietBreakdown: hanVietBreakdown.length > 0 ? hanVietBreakdown : manualHanViet,
      exampleIds: [],
      exampleJp: phrase.exampleJp?.trim() || undefined,
      exampleVi: phrase.exampleVi?.trim() || undefined,
      tags: ['custom', 'conversation']
    },
    deckId,
    fsrsCard: createNewCard(),
    isNew: true,
    isDue: false
  };
}
