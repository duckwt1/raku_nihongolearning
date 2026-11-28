import type { JlptLevel } from '../models/schemas.js';
import type { QuickReplyCategory, SentenceAttemptRecord } from './schemas.js';

export const QUICK_REPLY_PASS_SCORE = 50;

export interface QuickReplyItem {
  id: string;
  jlpt: JlptLevel;
  category: QuickReplyCategory;
  questionJp: string;
  readingJp: string;
  questionVi: string;
  contextVi: string;
}

export const QUICK_REPLY_CATEGORY_LABELS: Record<QuickReplyCategory, string> = {
  daily: 'Đời sống',
  dining: 'Ăn uống',
  shopping: 'Mua sắm',
  travel: 'Di chuyển',
  friends: 'Bạn bè',
  work: 'Công việc',
  study: 'Học tập',
  health: 'Sức khỏe',
  home: 'Nhà cửa',
  social: 'Giao tiếp & Phản xạ'
};

type RawQuickReplyTuple = [
  id: string,
  jlpt: JlptLevel,
  category: QuickReplyCategory,
  questionJp: string,
  readingJp: string,
  questionVi: string,
  contextVi: string
];

const RAW_QUICK_REPLIES: RawQuickReplyTuple[] = [
  // ======================== 1. DAILY (32) ========================
  ['qr_daily_001', 'N5', 'daily', '今朝は何時に起きましたか？', 'けさはなんじにおきましたか？', 'Sáng nay bạn dậy lúc mấy giờ?', 'Đồng nghiệp hỏi thăm buổi sáng.'],
  ['qr_daily_002', 'N5', 'daily', '今日はいい天気ですね。どこか出かけますか？', 'きょうはいいてんきですね。どこかでかけますか？', 'Hôm nay trời đẹp nhỉ. Bạn có định đi đâu không?', 'Hàng xóm bắt chuyện khi gặp ở cổng.'],
  ['qr_daily_003', 'N5', 'daily', '休みの日はいつも何をしていますか？', 'やすみのひはいつもなにをしていますか？', 'Ngày nghỉ bạn thường làm gì?', 'Người bạn mới quen hỏi về thói quen cuối tuần.'],
  ['qr_daily_004', 'N5', 'daily', 'もうすぐ雨が降りそうだよ。傘持ってる？', 'もうすぐあめがふりそうだよ。かさもってる？', 'Sắp mưa rồi đấy. Cậu có mang ô không?', 'Bạn cùng lớp nhắc trước khi ra khỏi trường.'],
  ['qr_daily_005', 'N5', 'daily', '毎日どのくらい寝ていますか？', 'まいにちどのくらいねていますか？', 'Mỗi ngày bạn ngủ khoảng bao lâu?', 'Nói chuyện về thói quen sinh hoạt.'],
  ['qr_daily_006', 'N5', 'daily', '今日の夜は何をする予定ですか？', 'きょうのよるはなにをするよていですか？', 'Tối nay bạn có dự định làm gì?', 'Bạn hỏi kế hoạch buổi tối của bạn.'],
  ['qr_daily_007', 'N5', 'daily', '朝ごはんはパン派？それともご飯派？', 'あさごはんはパンは？それともごはんは？', 'Bữa sáng bạn thuộc phe ăn bánh mì hay ăn cơm?', 'Trò chuyện vui trong giờ giải lao.'],
  ['qr_daily_008', 'N5', 'daily', '最近すごく寒いですね。風邪ひいてないですか？', 'さいきんすごくさむいですね。かぜひいてないですか？', 'Dạo này lạnh quá nhỉ. Bạn không bị cảm chứ?', 'Gặp người quen ngoài đường vào mùa đông.'],
  ['qr_daily_009', 'N5', 'daily', 'スマホの充電、あと何パーセントある？', 'スマホのじゅうでん、あとなんパーセントある？', 'Pin điện thoại cậu còn bao nhiêu phần trăm?', 'Đang đi chơi cùng bạn.'],
  ['qr_daily_010', 'N5', 'daily', '普段、音楽はよく聴きますか？', 'ふだん、おんがくはよくききますか？', 'Thường ngày bạn có hay nghe nhạc không?', 'Nói chuyện về sở thích hằng ngày.'],
  ['qr_daily_011', 'N4', 'daily', '最近ハマっていることは何かありますか？', 'さいきんハマっていることはなにかありますか？', 'Dạo này bạn có đang mê cái gì không?', 'Bạn bè hỏi chuyện giải trí gần đây.'],
  ['qr_daily_012', 'N4', 'daily', '自炊はよくしますか？それとも外食が多いですか？', 'じすいはよくしますか？それともがいしょくがおおいですか？', 'Bạn hay tự nấu ăn hay ăn ngoài nhiều hơn?', 'Hỏi chuyện sinh hoạt khi sống một mình.'],
  ['qr_daily_013', 'N4', 'daily', '洗濯物、もう取り込んだ？暗くなってきたよ。', 'せんたくもの、もうとりこんだ？くらくなってきたよ。', 'Đã cất quần áo phơi chưa? Trời tối rồi đấy.', 'Bạn cùng phòng nhắc buổi chiều.'],
  ['qr_daily_014', 'N4', 'daily', '運動不足じゃない？何かスポーツしてる？', 'うんどうぶそくじゃない？なにかスポーツしてる？', 'Cậu có bị thiếu vận động không? Có chơi môn thể thao nào không?', 'Bạn hỏi về thói quen tập thể dục.'],
  ['qr_daily_015', 'N4', 'daily', '夜遅くまで起きていることが多いですか？', 'よるおそくまでおきていることがおおいですか？', 'Bạn có hay thức khuya không?', 'Trò chuyện về giờ giấc sinh hoạt.'],
  ['qr_daily_016', 'N4', 'daily', '日本に来てから、生活にはもう慣れましたか？', 'にほんにきてから、せいかつにはもうなれましたか？', 'Từ khi sang Nhật bạn đã quen với cuộc sống chưa?', 'Người quen người Nhật hỏi thăm.'],
  ['qr_daily_017', 'N4', 'daily', '今年の夏休みはどこか行く予定ある？', 'ことしのなつやすみはどこかいくよていある？', 'Kỳ nghỉ hè năm nay cậu có dự định đi đâu không?', 'Bạn bè hỏi kế hoạch kỳ nghỉ.'],
  ['qr_daily_018', 'N4', 'daily', '毎日コーヒーを何杯くらい飲みますか？', 'まいにちコーヒーをなんばいくらいのみますか？', 'Mỗi ngày bạn uống khoảng mấy cốc cà phê?', 'Nói chuyện ở góc pha cà phê.'],
  ['qr_daily_019', 'N4', 'daily', 'ペットを飼ったことはありますか？', 'ペットをかったことはありますか？', 'Bạn đã từng nuôi thú cưng bao giờ chưa?', 'Trò chuyện đời thường.'],
  ['qr_daily_020', 'N4', 'daily', '朝はすぐに起きられるタイプですか？', 'あさはすぐにおきられるタイプですか？', 'Bạn có phải kiểu người sáng dậy được ngay không?', 'Nói chuyện vui về thói quen buổi sáng.'],
  ['qr_daily_021', 'N3', 'daily', '最近、時間の経つのがすごく早く感じませんか？', 'さいきん、じかんのたつのがすごくはやくかんじませんか？', 'Gần đây bạn có thấy thời gian trôi nhanh quá không?', 'Tâm sự nhẹ với đồng nghiệp cuối tuần.'],
  ['qr_daily_022', 'N3', 'daily', 'ストレスが溜まったとき、どうやって発散していますか？', 'ストレスがたまったとき、どうやってはっさんしていますか？', 'Khi bị căng thẳng bạn giải tỏa bằng cách nào?', 'Trò chuyện thân mật với bạn bè.'],
  ['qr_daily_023', 'N3', 'daily', 'ニュースは普段どうやってチェックしていますか？', 'ニュースはふだんどうやってチェックしていますか？', 'Thường ngày bạn cập nhật tin tức bằng cách nào?', 'Hỏi chuyện đọc báo, xem tin.'],
  ['qr_daily_024', 'N3', 'daily', '日本の四季の中で、どの季節が一番好きですか？', 'にほんのしきのなかで、どのきせつがいちばんすきですか？', 'Trong bốn mùa ở Nhật bạn thích mùa nào nhất?', 'Nói chuyện về thời tiết & các mùa.'],
  ['qr_daily_025', 'N3', 'daily', 'スマホの見すぎで目が疲れたりしませんか？', 'スマホのみすぎでめがつかれたりしませんか？', 'Xem điện thoại nhiều quá bạn có bị mỏi mắt không?', 'Trò chuyện đời sống hằng ngày.'],
  ['qr_daily_026', 'N3', 'daily', '朝型と夜型、どっちのタイプですか？', 'あさがたとよるがた、どっちのタイプですか？', 'Bạn thuộc tuýp người buổi sáng hay cú đêm?', 'Nói chuyện về nhịp sinh học.'],
  ['qr_daily_027', 'N3', 'daily', 'キャッシュレス決済と現金、普段どっちが多いですか？', 'キャッシュレスけっさいとげんきん、ふだんどっちがおおいですか？', 'Thường ngày bạn dùng thanh toán không tiền mặt hay tiền mặt nhiều hơn?', 'Nói chuyện về thói quen tiêu dùng ở Nhật.'],
  ['qr_daily_028', 'N3', 'daily', '今年中に絶対に達成したい目標ってありますか？', 'ことしじゅうにぜったいにたっせいしたいもくひょうってありますか？', 'Bạn có mục tiêu nào nhất định muốn đạt được trong năm nay không?', 'Hỏi chuyện kế hoạch cá nhân.'],
  ['qr_daily_029', 'N2', 'daily', '最近物価が上がって、生活費が大変になってきましたよね。', 'さいきんぶっかがあがって、せいかつひがたいへんになってきましたよね。', 'Gần đây vật giá tăng, chi phí sinh hoạt cũng vất vả hơn nhỉ.', 'Tán gẫu với đồng nghiệp về đời sống.'],
  ['qr_daily_030', 'N2', 'daily', 'ワークライフバランスを保つために意識していることはありますか？', 'ワークライフバランスをたもつためにいしきしていることはありますか？', 'Bạn có chú ý điều gì để giữ cân bằng công việc và cuộc sống không?', 'Nói chuyện với tiền bối.'],
  ['qr_daily_031', 'N2', 'daily', 'もし1週間まるごと自由な休みがあったら、何をして過ごしたいですか？', 'もしいっしゅうかんまるごとじゆうなやすみがあったら、なにをしてすごしたいですか？', 'Nếu có nguyên 1 tuần nghỉ tự do bạn muốn làm gì?', 'Nói chuyện thư giãn cuối ngày.'],
  ['qr_daily_032', 'N1', 'daily', '日常の中でちょっとした幸せを感じる瞬間ってどんなときですか？', 'にちじょうのなかでちょっとしたしあわせをかんじるしゅんかんってどんなときですか？', 'Trong cuộc sống thường nhật, khoảnh khắc nào khiến bạn thấy hạnh phúc nho nhỏ?', 'Cuộc trò chuyện sâu với bạn thân.'],

  // ======================== 2. DINING (32) ========================
  ['qr_dining_001', 'N5', 'dining', 'いらっしゃいませ！何名様ですか？', 'いらっしゃいませ！なんめいさまですか？', 'Xin chào quý khách! Quý khách đi mấy người ạ?', 'Vừa bước vào nhà hàng.'],
  ['qr_dining_002', 'N5', 'dining', 'ご注文はお決まりですか？', 'ごちゅうもんはおきまりですか？', 'Quý khách đã chọn được món chưa ạ?', 'Nhân viên tới bàn ghi món.'],
  ['qr_dining_003', 'N5', 'dining', 'お飲み物はいかがなさいますか？', 'おのみものはいかがなさいますか？', 'Quý khách có dùng đồ uống gì không ạ?', 'Nhân viên quán ăn hỏi gọi nước.'],
  ['qr_dining_004', 'N5', 'dining', '店内でお召し上がりですか？お持ち帰りですか？', 'てんないでおめしあがりですか？おもちかえりですか？', 'Bạn dùng tại quán hay mang về ạ?', 'Đặt món ở quán café / đồ ăn nhanh.'],
  ['qr_dining_005', 'N5', 'dining', 'ホットとアイス、どちらになさいますか？', 'ホットとアイス、どちらになさいますか？', 'Bạn dùng nóng hay đá ạ?', 'Gọi cà phê hoặc trà tại quầy.'],
  ['qr_dining_006', 'N5', 'dining', '今日の昼ごはん、何食べようか？', 'きょうのひるごはん、なにたべようか？', 'Trưa nay ăn gì nhỉ?', 'Đồng nghiệp rủ đi ăn trưa.'],
  ['qr_dining_007', 'N5', 'dining', '辛い食べ物は大丈夫ですか？', 'からいたべものはだいじょうぶですか？', 'Bạn có ăn được đồ cay không?', 'Bạn định chọn quán ăn cay.'],
  ['qr_dining_008', 'N5', 'dining', '日本の食べ物で何が一番好きですか？', 'にほんのたべものでなにがいちばんすきですか？', 'Trong các món ăn Nhật bạn thích món nào nhất?', 'Trò chuyện cùng người Nhật.'],
  ['qr_dining_009', 'N5', 'dining', 'このケーキすごく美味しいよ！一口食べる？', 'このケーキすごくおいしいよ！ひとくちたべる？', 'Bánh này ngon lắm! Ăn thử một miếng không?', 'Đi café với bạn.'],
  ['qr_dining_010', 'N5', 'dining', 'お会計はご一緒ですか？別々ですか？', 'おかいけいはごいっしょですか？べつべつですか？', 'Quý khách thanh toán chung hay tách bill ạ?', 'Lúc tính tiền ở quầy thu ngân.'],
  ['qr_dining_011', 'N4', 'dining', '苦手な食べ物やアレルギーはありますか？', 'にがてなたべものやアレルギーはありますか？', 'Bạn có món nào không ăn được hoặc bị dị ứng không?', 'Trước khi đặt bàn ăn nhóm.'],
  ['qr_dining_012', 'N4', 'dining', 'ご飯は大盛りにできますが、どうしますか？', 'ごはんはおおもりにできますが、どうしますか？', 'Cơm có thể gọi phần lớn miễn phí, bạn có muốn không?', 'Nhân viên quán cơm hỏi.'],
  ['qr_dining_013', 'N4', 'dining', 'ラーメンは何味が一番好き？味噌？醤油？豚骨？', 'ラーメンはなにあじがいちばんすき？みそ？しょうゆ？とんこつ？', 'Ramen cậu thích vị nào nhất? Miso, nước tương hay xương heo?', 'Tám chuyện đồ ăn với bạn Nhật.'],
  ['qr_dining_014', 'N4', 'dining', 'お水のおかわりはいかがですか？', 'おみずのおかわりはいかがですか？', 'Quý khách có cần thêm nước không ạ?', 'Nhân viên đi ngang qua bàn.'],
  ['qr_dining_015', 'N4', 'dining', 'ベトナム料理で一番おすすめの料理は何ですか？', 'ベトナムりょうりでいちばんおすすめのりょうりはなんですか？', 'Món ăn Việt Nam nào bạn khuyên nên thử nhất?', 'Bạn người Nhật tò mò về ẩm thực Việt.'],
  ['qr_dining_016', 'N4', 'dining', 'パクチーは食べられる？抜いてもらう？', 'パクチーはたべられる？ぬいてもらう？', 'Cậu ăn được rau mùi không hay bảo quán bỏ ra?', 'Đi ăn quán châu Á cùng bạn.'],
  ['qr_dining_017', 'N4', 'dining', 'お腹すいたね！この近くで美味しいお店知らない？', 'おなかすいたね！このちかくでおいしいおみせしらない？', 'Đói bụng quá! Cậu có biết quán nào ngon gần đây không?', 'Đi bộ cùng bạn buổi tối.'],
  ['qr_dining_018', 'N4', 'dining', 'デザートも頼む？それとももうお腹いっぱい？', 'デザートもたのむ？それとももうおなかいっぱい？', 'Gọi thêm tráng miệng không hay no căng rồi?', 'Ăn xong bữa chính ở nhà hàng.'],
  ['qr_dining_019', 'N4', 'dining', 'お酒は強いほうですか？よく飲みますか？', 'おさけはつよいほうですか？よくのみますか？', 'Bạn có uống được rượu bia không? Có hay uống không?', 'Trước buổi tiệc công ty / nomikai.'],
  ['qr_dining_020', 'N4', 'dining', 'お箸とフォーク、どちらをお使いになりますか？', 'おはしとフォーク、どちらをおつかいになりますか？', 'Quý khách muốn dùng đũa hay dĩa ạ?', 'Nhân viên nhà hàng hỏi.'],
  ['qr_dining_021', 'N3', 'dining', 'すみません、こちらのお皿はお下げしてもよろしいでしょうか？', 'すみません、こちらのおさらはおさげしてもよろしいでしょうか？', 'Xin lỗi, tôi có thể dọn đĩa này đi được không ạ?', 'Nhân viên dọn bàn tại nhà hàng.'],
  ['qr_dining_022', 'N3', 'dining', '今夜の飲み会、一次会だけで帰る？二次会も行く？', 'こんやののみかい、いちじかいだけでかえる？にじかいもいく？', 'Tiệc tối nay cậu về sau tăng 1 hay đi cả tăng 2?', 'Đồng nghiệp hỏi nhỏ trước buổi tiệc.'],
  ['qr_dining_023', 'N3', 'dining', 'このお店、予約しないと入れないかな？', 'このおみせ、よやくしないとはいれないかな？', 'Quán này không đặt trước liệu có vào được không nhỉ?', 'Lên kế hoạch ăn tối thứ Sáu.'],
  ['qr_dining_024', 'N3', 'dining', '割り勘にする？一人いくらくらいになるかな。', 'わりかんにする？ひとりいくらくらいになるかな。', 'Chia đều tiền nhé? Mỗi người khoảng bao nhiêu nhỉ?', 'Chuẩn bị tính tiền sau bữa ăn nhóm.'],
  ['qr_dining_025', 'N3', 'dining', '最近、健康のために食事で気をつけていることはありますか？', 'さいきん、けんこうのためにしょくじできをつけていることはありますか？', 'Gần đây bạn có chú ý gì trong ăn uống để giữ sức khỏe không?', 'Nói chuyện buổi trưa.'],
  ['qr_dining_026', 'N3', 'dining', 'すみません、今満席で20分ほどお待ちいただきますがよろしいですか？', 'すみません、いままんせきでにじゅっぷんほどおまちいただきますがよろしいですか？', 'Xin lỗi hiện quán đang kín bàn, chờ khoảng 20 phút có được không ạ?', 'Nhân viên tiếp tân nhà hàng đông khách.'],
  ['qr_dining_027', 'N3', 'dining', '得意料理って何かありますか？今度作ってほしいな！', 'とくいりょうりってなにかありますか？こんどつくってほしいな！', 'Bạn có món tủ nào không? Hôm nào nấu cho mình ăn thử nhé!', 'Bạn khen bạn nấu ăn ngon.'],
  ['qr_dining_028', 'N3', 'dining', '食べ放題とコース料理、どっちがいいと思う？', 'たべほうだいとコースりょうり、どっちがいいとおもう？', 'Buffet ăn thỏa thích hay set menu, cậu thấy cái nào ổn hơn?', 'Chọn menu cho tiệc sinh nhật bạn.'],
  ['qr_dining_029', 'N2', 'dining', 'お料理の味付けはいかがでしたか？お口に合いましたか？', 'おりょうりのあじつけはいかがでしたか？おくちにあいましたか？', 'Hương vị món ăn thế nào ạ? Có hợp khẩu vị quý khách không?', 'Đầu bếp / chủ quán hỏi thăm.'],
  ['qr_dining_030', 'N2', 'dining', 'お持ち帰り用の容器をご用意いたしましょうか？', 'おもちかえりようのようきをごよういいたしましょうか？', 'Tôi chuẩn bị hộp để quý khách mang phần còn lại về nhé?', 'Đồ ăn còn dư ở nhà hàng.'],
  ['qr_dining_031', 'N2', 'dining', '接待のお店を探しているんですが、落ち着いた個室のあるお店をご存じですか？', 'せったいのおみせをさがしているんですが、おちついたこしつのあるおみせをごぞんじですか？', 'Tôi đang tìm quán tiếp khách có phòng riêng yên tĩnh, bạn biết quán nào không?', 'Đồng nghiệp nhờ gợi ý quán ăn.'],
  ['qr_dining_032', 'N1', 'dining', 'せっかくの記念日だし、少し奮発していいお店を予約しようか？', 'せっかくのきねんびだし、すこしふんぱつしていいおみせをよやくしようか？', 'Hiếm khi có ngày kỷ niệm, chi mạnh tay đặt một nhà hàng xịn nhé?', 'Lên kế hoạch ngày đặc biệt.'],

  // ======================== 3. SHOPPING (30) ========================
  ['qr_shop_001', 'N5', 'shopping', 'レジ袋はご利用になりますか？', 'レジぶくろはごりようになりますか？', 'Quý khách có dùng túi nilon không ạ?', 'Thanh toán ở Konbini / siêu thị.'],
  ['qr_shop_002', 'N5', 'shopping', 'お弁当、温めますか？', 'おべんとう、あたためますか？', 'Bạn có muốn hâm nóng hộp cơm không ạ?', 'Mua cơm hộp tại cửa hàng tiện lợi.'],
  ['qr_shop_003', 'N5', 'shopping', 'ポイントカードはお持ちですか？', 'ポイントカードはおもちですか？', 'Quý khách có thẻ tích điểm không ạ?', 'Thu ngân hỏi khi thanh toán.'],
  ['qr_shop_004', 'N5', 'shopping', 'お支払い方法はいかがなさいますか？', 'おしはらいほうほうはいかがなさいますか？', 'Quý khách muốn thanh toán bằng hình thức nào ạ?', 'Tại quầy tính tiền.'],
  ['qr_shop_005', 'N5', 'shopping', 'レシートはお入れしますか？', 'レシートはおいれしますか？', 'Quý khách có lấy hóa đơn không ạ?', 'Sau khi thanh toán ở cửa hàng.'],
  ['qr_shop_006', 'N5', 'shopping', '何かお探しですか？', 'なにかおさがしですか？', 'Quý khách đang tìm sản phẩm gì ạ?', 'Nhân viên cửa hàng tiến lại hỏi thăm.'],
  ['qr_shop_007', 'N5', 'shopping', 'ご試着されますか？', 'ごしちゃくされますか？', 'Quý khách có muốn mặc thử không ạ?', 'Đang cầm một chiếc áo trong shop thời trang.'],
  ['qr_shop_008', 'N5', 'shopping', 'サイズはいかがでしたか？', 'サイズはいかがでしたか？', 'Size mặc có vừa không ạ?', 'Vừa bước ra từ phòng thử đồ.'],
  ['qr_shop_009', 'N5', 'shopping', 'プレゼント用にお包みしましょうか？', 'プレゼントようにおつつみしましょうか？', 'Tôi gói quà cho quý khách nhé?', 'Mua đồ làm quà tặng.'],
  ['qr_shop_010', 'N5', 'shopping', 'これとあれ、どっちの色が似合うと思う？', 'これとあれ、どっちのいろがにあうとおもう？', 'Cái này với cái kia, cậu thấy màu nào hợp hơn?', 'Đi mua quần áo cùng bạn.'],
  ['qr_shop_011', 'N4', 'shopping', 'お箸は何膳お付けしますか？', 'おはしはなんぜんおつけしますか？', 'Bạn cần lấy mấy đôi đũa ạ?', 'Mua đồ ăn mang về tại Konbini.'],
  ['qr_shop_012', 'N4', 'shopping', 'こちらの色違いもございますが、お出ししましょうか？', 'こちらのいろちがいもございますが、おだししましょうか？', 'Mẫu này có màu khác nữa, tôi lấy cho bạn xem nhé?', 'Nhân viên shop quần áo tư vấn.'],
  ['qr_shop_013', 'N4', 'shopping', 'ネットショッピングとお店で買うの、どっちが多いですか？', 'ネットショッピングとおみせでかうの、どっちがおおいですか？', 'Bạn hay mua online hay ra cửa hàng mua trực tiếp hơn?', 'Tán gẫu về thói quen mua sắm.'],
  ['qr_shop_014', 'N4', 'shopping', 'これ、ちょっと高くない？セールまで待ったほうがいいかな。', 'これ、ちょっとたかくない？セールまでまったほうがいいかな。', 'Cái này hơi đắt nhỉ? Có nên đợi đến đợt giảm giá không?', 'Đang phân vân món đồ đắt tiền.'],
  ['qr_shop_015', 'N4', 'shopping', '免税の手続きをご希望ですか？パスポートはお持ちですか？', 'めんぜいのてつづきをごきぼうですか？パスポートはおもちですか？', 'Quý khách có muốn làm thủ tục miễn thuế không? Có mang hộ chiếu không ạ?', 'Mua sắm tại trung tâm thương mại.'],
  ['qr_shop_016', 'N4', 'shopping', 'スーパーで何か買ってきてほしいものある？', 'スーパーでなにかかってきてほしいものある？', 'Cậu có cần mua thêm gì ở siêu thị không?', 'Bạn cùng phòng chuẩn bị đi siêu thị.'],
  ['qr_shop_017', 'N4', 'shopping', 'この靴、歩きやすそうだね。いくらだったの？', 'このくつ、あるきやすそうだね。いくらだったの？', 'Đôi giày này trông đi êm nhỉ. Cậu mua bao nhiêu thế?', 'Bạn khen đôi giày mới của bạn.'],
  ['qr_shop_018', 'N4', 'shopping', 'お釣りは500円になります。ご確認お願いします。', 'おつりはごひゃくえんになります。ごかくにんおねがいします。', 'Tiền thối lại là 500 yên. Phiền bạn kiểm tra giúp ạ.', 'Nhân viên trả tiền thừa.'],
  ['qr_shop_019', 'N3', 'shopping', 'すみません、こちら在庫切れなんですが、他店からお取り寄せしましょうか？', 'すみません、こちらざいこぎれなんですが、たてんからおとりよせしましょうか？', 'Xin lỗi mẫu này hết hàng rồi, tôi đặt chuyển từ chi nhánh khác giúp bạn nhé?', 'Nhân viên kiểm tra kho hàng.'],
  ['qr_shop_020', 'N3', 'shopping', '返品や交換をご希望ですか？レシートはお持ちでしょうか？', 'へんぴんやこうかんをごきぼうですか？レシートはおもちでしょうか？', 'Quý khách muốn đổi hay trả hàng ạ? Có mang theo hóa đơn không?', 'Quay lại quầy chăm sóc khách hàng.'],
  ['qr_shop_021', 'N3', 'shopping', '保証は1年間ついていますが、延長保証もお付けになりますか？', 'ほしょうはいちねんかんついていますが、えんちょうほしょうもおつけになりますか？', 'Sản phẩm có bảo hành 1 năm, bạn có muốn mua thêm gói bảo hành mở rộng không?', 'Mua đồ điện tử tại BicCamera / Yodobashi.'],
  ['qr_shop_022', 'N3', 'shopping', '最近買ったもので「買ってよかった！」と思うものはありますか？', 'さいきんかったもので「かってよかった！」とおもうものはありますか？', 'Gần đây có món nào bạn mua xong thấy cực kỳ đáng tiền không?', 'Trò chuyện cùng bạn bè.'],
  ['qr_shop_023', 'N3', 'shopping', 'この家電、性能はいいんだけど予算オーバーなんだよね。', 'このかでん、せいのうはいいんだけどよさんオーバーなんだよね。', 'Đồ điện này tính năng ngon nhưng vượt ngân sách mất rồi.', 'Bạn nhờ góp ý lúc đi mua đồ.'],
  ['qr_shop_024', 'N3', 'shopping', '配送をご希望の場合、ご希望のお届け日時はございますか？', 'はいそうをごきぼうのばあい、ごきぼうのおとどけにちじはございますか？', 'Nếu muốn giao hàng tận nhà, quý khách muốn nhận vào ngày giờ nào ạ?', 'Mua đồ cồng kềnh tại cửa hàng nội thất.'],
  ['qr_shop_025', 'N3', 'shopping', 'メルカリとかフリマアプリ、使ったことありますか？', 'メルカリとかフリマアプリ、つかったことありますか？', 'Bạn đã bao giờ dùng ứng dụng mua bán đồ cũ như Mercari chưa?', 'Hỏi chuyện mua sắm tiết kiệm ở Nhật.'],
  ['qr_shop_026', 'N3', 'shopping', 'お土産を買うなら、お菓子と雑貨どっちが喜ばれると思う？', 'おみやげをかうなら、おかしとざっかどっちがよろこばれるとおもう？', 'Mua quà lưu niệm thì bánh kẹo hay đồ lưu niệm được thích hơn nhỉ?', 'Chọn quà mang về cho gia đình / đồng nghiệp.'],
  ['qr_shop_027', 'N2', 'shopping', 'デザイン重視で選ぶか、実用性重視で選ぶか迷っているんです。', 'デザインじゅうしでえらぶか、じつようせいじゅうしでえらぶかまよっているんです。', 'Tôi đang phân vân chọn theo thiết kế hay theo tính thực dụng.', 'Thảo luận khi chọn mua laptop / túi xách.'],
  ['qr_shop_028', 'N2', 'shopping', 'こちらの商品に初期不良が見つかった場合、どのように対応していただけますか？', 'こちらのしょうひんにしょきふりょうがみつかったばあい、どのようにたいおうしていただけますか？', 'Nếu sản phẩm có lỗi từ nhà sản xuất thì chính sách xử lý thế nào?', 'Thực hành phản xạ đóng vai nhân viên hoặc trả lời tình huống mua đồ.'],
  ['qr_shop_029', 'N2', 'shopping', '衝動買いをして後悔したことってありますか？', 'しょうどうがいをしてこうかいしたことってありますか？', 'Bạn đã từng mua đồ theo cảm hứng rồi hối hận chưa?', 'Tán gẫu vui về mua sắm.'],
  ['qr_shop_030', 'N1', 'shopping', '長く使えるものを少し高くても買う派？それともコスパ重視派？', 'ながくつかえるものをすこしたかくてもかうは？それともコスパじゅうしは？', 'Bạn thuộc phe mua đồ đắt nhưng dùng lâu hay phe ưu tiên giá/hiệu năng?', 'Trao đổi quan điểm tiêu dùng.'],

  // ======================== 4. TRAVEL (32) ========================
  ['qr_travel_001', 'N5', 'travel', 'すみません、この電車は新宿に止まりますか？', 'すみません、このでんしゃはしんじゅくにとまりますか？', 'Xin lỗi, chuyến tàu này có dừng ở Shinjuku không?', 'Người khác hỏi bạn trên sân ga.'],
  ['qr_travel_002', 'N5', 'travel', '家から会社まで電車でどのくらいかかりますか？', 'いえからかいしゃまででんしゃでどのくらいかかりますか？', 'Từ nhà đến công ty đi tàu mất khoảng bao lâu?', 'Đồng nghiệp hỏi về đường đi làm.'],
  ['qr_travel_003', 'N5', 'travel', '切符はもう買いましたか？それともSuicaですか？', 'きっぷはもうかいましたか？それともスイカですか？', 'Bạn mua vé chưa hay dùng thẻ Suica?', 'Chuẩn bị vào cổng soát vé.'],
  ['qr_travel_004', 'N5', 'travel', '日本のどこに旅行に行ってみたいですか？', 'にほんのどこにりょこうにいってみたいですか？', 'Bạn muốn đi du lịch ở đâu tại Nhật Bản?', 'Trò chuyện về du lịch Nhật.'],
  ['qr_travel_005', 'N5', 'travel', '次の駅で乗り換えだよね？何番線かな？', 'つぎのえきでのりかえだよね？なんばんせんかな？', 'Ga tới phải đổi tàu đúng không? Sân ga số mấy nhỉ?', 'Đi tàu cùng bạn.'],
  ['qr_travel_006', 'N5', 'travel', 'すみません、写真を一枚撮っていただけませんか？', 'すみません、しゃしんをいちまいとっていただけませんか？', 'Xin lỗi, bạn có thể chụp giúp tôi một tấm ảnh được không?', 'Khách du lịch nhờ bạn chụp ảnh.'],
  ['qr_travel_007', 'N5', 'travel', 'チェックインですか？お名前をお願いします。', 'チェックインですか？おなまえをおねがいします。', 'Quý khách làm thủ tục nhận phòng ạ? Cho tôi xin tên ạ.', 'Tại quầy lễ tân khách sạn.'],
  ['qr_travel_008', 'N5', 'travel', '窓側と通路側、どちらのお席がよろしいですか？', 'まどがわとつうろがわ、どちらのおせきがよろしいですか？', 'Quý khách muốn ngồi cạnh cửa sổ hay cạnh lối đi ạ?', 'Làm thủ tục máy bay / đặt vé Shinkansen.'],
  ['qr_travel_009', 'N4', 'travel', '電車が10分くらい遅れているみたい。間に合いそう？', 'でんしゃがじゅっぷんくらいおくれているみたい。まにあいそう？', 'Tàu hình như bị trễ khoảng 10 phút. Có kịp giờ không?', 'Đang trên đường đến chỗ hẹn.'],
  ['qr_travel_010', 'N4', 'travel', '荷物が重そうだね。半分持ってあげようか？', 'にもつがおもそうだね。はんぶんもってあげようか？', 'Hành lý trông nặng quá. Để mình xách giúp một nửa nhé?', 'Bạn đề nghị giúp đỡ ở sân bay/nhà ga.'],
  ['qr_travel_011', 'N4', 'travel', '今まで行った旅行の中で、一番良かった場所はどこですか？', 'いままでいったりょこうのなかで、いちばんよかったばしょはどこですか？', 'Trong các chuyến du lịch đã đi, nơi nào bạn thấy thích nhất?', 'Nói chuyện về trải nghiệm du lịch.'],
  ['qr_travel_012', 'N4', 'travel', 'ご朝食は朝7時から9時までですが、ご利用になりますか？', 'ごちょうしょくはあさしちじからくじまでですが、ごりようになりますか？', 'Bữa sáng phục vụ từ 7h đến 9h, quý khách có dùng không ạ?', 'Lễ tân khách sạn thông báo khi check-in.'],
  ['qr_travel_013', 'N4', 'travel', 'バスとタクシー、どっちで行ったほうがいいかな？', 'バスとタクシー、どっちでいったほうがいいかな？', 'Đi xe buýt hay taxi thì tiện hơn nhỉ?', 'Trời đang mưa và nhóm đang gấp.'],
  ['qr_travel_014', 'N4', 'travel', '道に迷っちゃったみたい！地図アプリ見られる？', 'みちにまよっちゃったみたい！ちずアプリみられる？', 'Hình như lạc đường rồi! Cậu mở app bản đồ xem được không?', 'Đi du lịch cùng bạn.'],
  ['qr_travel_015', 'N4', 'travel', 'チェックアウトの後に荷物を預けたいですか？', 'チェックアウトのあとにもつをあずけたいですか？', 'Sau khi trả phòng bạn có muốn gửi lại hành lý không?', 'Tại lễ tân khách sạn.'],
  ['qr_travel_016', 'N4', 'travel', 'ベトナム旅行に行くなら、一番いい季節はいつですか？', 'ベトナムりょこうにいくなら、いちばんいいきせつはいつですか？', 'Nếu đi du lịch Việt Nam thì mùa nào đẹp nhất?', 'Bạn người Nhật chuẩn bị sang Việt Nam.'],
  ['qr_travel_017', 'N4', 'travel', '自転車と電車、普段の移動はどっちが多いですか？', 'じてんしゃとでんしゃ、ふだんのいどうはどっちがおおいですか？', 'Thường ngày bạn hay đi xe đạp hay đi tàu điện hơn?', 'Nói chuyện về phương tiện đi lại.'],
  ['qr_travel_018', 'N4', 'travel', 'すみません、一番近いコンビニはどこにありますか？', 'すみません、いちばんちかいコンビニはどこにありますか？', 'Xin lỗi, cửa hàng tiện lợi gần nhất ở đâu vậy?', 'Khách hỏi đường bạn.'],
  ['qr_travel_019', 'N3', 'travel', '朝ラッシュの満員電車、毎日乗るの大変じゃないですか？', 'あさラッシュのまんいんでんしゃ、まいにちのるのたいへんじゃないですか？', 'Sáng nào cũng đi tàu đông nghẹt giờ cao điểm có mệt không?', 'Đồng nghiệp hỏi chuyện đi làm.'],
  ['qr_travel_020', 'N3', 'travel', '一人旅と友達との旅行、どっちが好きですか？', 'ひとりたびとともだちとのりょこう、どっちがすきですか？', 'Du lịch một mình hay đi cùng bạn bè, bạn thích kiểu nào hơn?', 'Tâm sự về phong cách du lịch.'],
  ['qr_travel_021', 'N3', 'travel', '新幹線と夜行バス、大阪に行くならどっちを選びますか？', 'しんかんせんとやこうバス、おおさかにいくならどっちをえらびますか？', 'Đi Osaka thì bạn chọn tàu Shinkansen hay xe buýt đêm?', 'Lên kế hoạch đi du lịch tiết kiệm.'],
  ['qr_travel_022', 'N3', 'travel', '温泉旅館に泊まったことはありますか？どうでしたか？', 'おんせんりょかんにとまったことはありますか？どうでしたか？', 'Bạn từng ở nhà trọ suối nước nóng Ryokan bao giờ chưa? Cảm giác thế nào?', 'Trò chuyện về văn hóa du lịch Nhật.'],
  ['qr_travel_023', 'N3', 'travel', '旅行の計画はしっかり立てるタイプ？それとも行き当たりばったり？', 'りょこうのけいかくはしっかりたてるタイプ？それともいきあたりばったり？', 'Đi du lịch bạn thuộc tuýp lên lịch chi tiết hay cứ đi tới đâu tính tới đó?', 'Trước khi lên lịch chuyến đi chung.'],
  ['qr_travel_024', 'N3', 'travel', 'すみません、遅延証明書はどこでもらえますか？', 'すみません、ちえんしょうめいしょはどこでもらえますか？', 'Xin lỗi, giấy chứng nhận tàu trễ lấy ở đâu vậy?', 'Người đi làm hỏi bạn ở cổng ga.'],
  ['qr_travel_025', 'N3', 'travel', '海外旅行に行くとき、絶対に忘れたくない持ち物は何ですか？', 'かいがいりょこうにいくとき、ぜったいにわすれたくないもちものはなんですか？', 'Khi đi du lịch nước ngoài, món đồ nào bạn tuyệt đối không muốn quên?', 'Chuẩn bị hành lý du lịch.'],
  ['qr_travel_026', 'N3', 'travel', 'このあたりで静かに休憩できるカフェはありますか？', 'このあたりでしずかにきゅうけいできるカフェはありますか？', 'Quanh đây có quán café nào yên tĩnh để nghỉ chân không?', 'Người quen hỏi khi đi dạo phố.'],
  ['qr_travel_027', 'N2', 'travel', 'フライトが2時間遅延しているんですが、乗り継ぎに間に合うでしょうか？', 'フライトがにじかんちえんしているんですが、のりつぎにまにあうでしょうか？', 'Chuyến bay bị trễ 2 tiếng, liệu có kịp chuyến nối không nhỉ?', 'Tình huống ở sân bay.'],
  ['qr_travel_028', 'N2', 'travel', '観光地って最近はどこも混雑しているので、穴場スポットを探しているんです。', 'かんこうちってさいきんどこもこんざつしているので、あなばスポットをさがしているんです。', 'Dạo này điểm du lịch nào cũng đông nên tôi đang tìm chỗ đẹp ít người biết.', 'Trao đổi kinh nghiệm du lịch.'],
  ['qr_travel_029', 'N2', 'travel', 'レンタカーを借りてドライブ旅行するのって、日本の免許が必要ですよね？', 'レンタカーをかりてドライブりょこうするのって、にほんのめんきょがひつようですよね？', 'Thuê xe tự lái đi phượt ở Nhật cần bằng lái Nhật đúng không?', 'Bạn hỏi thông tin thuê xe.'],
  ['qr_travel_030', 'N2', 'travel', 'ホテルの部屋、禁煙ルームをお願いしたはずなんですが少しタバコの匂いがします。', 'ホテルのへや、きんえんルームをおねがいしたはずなんですがすこしタバコのにおいがします。', 'Phòng khách sạn tôi đặt phòng không hút thuốc nhưng hơi có mùi thuốc lá.', 'Phản hồi khéo với lễ tân hoặc đóng vai giải quyết.'],
  ['qr_travel_031', 'N1', 'travel', 'オーバーツーリズムが話題になっていますが、旅行者として気をつけるべきことは何だと思いますか？', 'オーバーツーリズムがわだいになっていますが、りょこうしゃとしてきをつけるべきことはなんだとおもいますか？', 'Quá tải du lịch đang là chủ đề nóng, theo bạn khách du lịch nên lưu ý điều gì?', 'Thảo luận xã hội trình độ cao.'],
  ['qr_travel_032', 'N1', 'travel', '旅行先で予期せぬトラブルに遭ったとき、どうやって乗り切りましたか？', 'りょこうさきでよきせぬトラブルにあったとき、どうやってのりきりましたか？', 'Khi gặp sự cố bất ngờ ở nơi du lịch bạn đã xoay xở vượt qua như thế nào?', 'Chia sẻ kinh nghiệm du lịch.'],

  // ======================== 5. FRIENDS (34) ========================
  ['qr_friend_001', 'N5', 'friends', '週末、暇？一緒に映画を見に行かない？', 'しゅうまつ、ひま？いっしょにえいがをみにいかない？', 'Cuối tuần rảnh không? Đi xem phim cùng nhau nhé?', 'Bạn thân nhắn tin rủ đi chơi.'],
  ['qr_friend_002', 'N5', 'friends', '趣味は何ですか？', 'しゅみはなんですか？', 'Sở thích của bạn là gì?', 'Lần đầu làm quen bạn mới.'],
  ['qr_friend_003', 'N5', 'friends', 'LINE交換してもいい？', 'ラインこうかんしてもいい？', 'Mình trao đổi LINE với nhau được không?', 'Kết thúc buổi gặp mặt làm quen.'],
  ['qr_friend_004', 'N5', 'friends', 'ごめん！5分くらい遅れそう！', 'ごめん！ごふんくらいおくれそう！', 'Xin lỗi! Mình có vẻ sẽ tới trễ khoảng 5 phút!', 'Bạn nhắn tin trước giờ hẹn.'],
  ['qr_friend_005', 'N5', 'friends', 'この写真すごく綺麗に撮れてるね！どこで撮ったの？', 'このしゃしんすごくきれいにとれてるね！どこでとったの？', 'Tấm ảnh này chụp đẹp quá! Cậu chụp ở đâu thế?', 'Bạn xem ảnh trên điện thoại bạn.'],
  ['qr_friend_006', 'N5', 'friends', '今度の土曜日、何時にどこで待ち合わせする？', 'こんどのどようび、なんじにどこでまちあわせする？', 'Thứ Bảy tới hẹn nhau mấy giờ ở đâu?', 'Chốt lịch đi chơi cuối tuần.'],
  ['qr_friend_007', 'N5', 'friends', 'アニメや漫画はよく見ますか？おすすめある？', 'アニメやまんがはよくみますか？おすすめある？', 'Cậu có hay xem anime hay đọc manga không? Gợi ý mình với!', 'Nói chuyện sở thích với bạn Nhật.'],
  ['qr_friend_008', 'N5', 'friends', '誕生日おめでとう！今日何かお祝いするの？', 'たんじょうびおめでとう！きょうなにかおいわいするの？', 'Chúc mừng sinh nhật! Hôm nay cậu có tổ chức ăn mừng gì không?', 'Bạn chúc mừng sinh nhật bạn.'],
  ['qr_friend_009', 'N5', 'friends', '今日は本当に楽しかったね！また遊ぼう！', 'きょうはほんとうにたのしかったね！またあそぼう！', 'Hôm nay vui thật đấy! Hôm nào lại đi chơi nhé!', 'Chia tay nhau ở nhà ga sau buổi đi chơi.'],
  ['qr_friend_010', 'N5', 'friends', '髪切った？すごく似合ってるよ！', 'かみきった？すごくにあってるよ！', 'Cậu mới cắt tóc à? Hợp lắm luôn ấy!', 'Bạn khen kiểu tóc mới của bạn.'],
  ['qr_friend_011', 'N4', 'friends', '今週の日曜日にバーベキューするんだけど、よかったら来ない？', 'こんしゅうのにちようびにバーベキューするんだけど、よかったらこない？', 'Chủ nhật tuần này tụi mình làm BBQ, cậu rảnh thì qua nhé?', 'Bạn mời tham gia tiệc ngoài trời.'],
  ['qr_friend_012', 'N4', 'friends', '最近何か面白い映画やドラマ見た？', 'さいきんなにかおもしろいえいがやドラマみた？', 'Gần đây cậu có xem bộ phim nào hay không?', 'Tìm phim để xem cuối tuần.'],
  ['qr_friend_013', 'N4', 'friends', 'カラオケって好き？よくどんな歌を歌うの？', 'カラオケってすき？よくどんなうたをうたうの？', 'Cậu có thích đi karaoke không? Hay hát bài gì thế?', 'Bạn rủ đi hát karaoke.'],
  ['qr_friend_014', 'N4', 'friends', 'ごめん、急に用事ができちゃって、明日の予定ずらせるかな？', 'ごめん、きゅうにようじができちゃって、あしたのよていずらせるかな？', 'Xin lỗi, đột xuất có việc bận, dời lịch hẹn ngày mai sang hôm khác được không?', 'Bạn nhắn tin xin đổi lịch hẹn.'],
  ['qr_friend_015', 'N4', 'friends', 'ゲームはよくする？一緒にオンラインでやらない？', 'ゲームはよくする？いっしょにオンラインでやらない？', 'Cậu có hay chơi game không? Hôm nào chơi online cùng không?', 'Bạn rủ chơi game.'],
  ['qr_friend_016', 'N4', 'friends', 'さっきの話、ちゃんと聞いてくれてありがとうね！', 'さっきのはなし、ちゃんときいてくれてありがとうね！', 'Cảm ơn cậu đã lắng nghe chuyện lúc nãy nhé!', 'Bạn cảm ơn sau khi tâm sự.'],
  ['qr_friend_017', 'N4', 'friends', '写真送ったよ！見られた？', 'しゃしんおくったよ！みられた？', 'Mình gửi ảnh rồi đấy! Cậu xem được chưa?', 'Sau chuyến đi chơi cùng nhóm.'],
  ['qr_friend_018', 'N4', 'friends', 'ねえ、ちょっと相談があるんだけど、今時間ある？', 'ねえ、ちょっとそうだんがあるんだけど、いまじかんある？', 'Này, mình có chuyện muốn tâm sự/hỏi ý kiến, giờ cậu có rảnh không?', 'Bạn thân gọi điện hoặc nhắn tin.'],
  ['qr_friend_019', 'N4', 'friends', '久しぶり！元気にしてた？最近どう？', 'ひさしぶり！げんきにしてた？さいきんどう？', 'Lâu quá không gặp! Cậu khỏe không? Dạo này thế nào?', 'Gặp lại bạn cũ sau nửa năm.'],
  ['qr_friend_020', 'N4', 'friends', '家でホームパーティーしようと思ってるんだけど、何か持ってきてほしいものある？', 'いえでホームパーティーしようとおもってるんだけど、なにかもってきてほしいものある？', 'Định làm tiệc tại nhà, cậu muốn góp ý mang đồ gì không?', 'Chuẩn bị tiệc nhóm bạn.'],
  ['qr_friend_021', 'N3', 'friends', '友達の誕生日プレゼント、何を選んだらいいか迷ってるんだよね。', 'ともだちのたんじょうびプレゼント、なにをえらんだらいいかまよってるんだよね。', 'Mình đang phân vân không biết mua quà sinh nhật gì cho bạn.', 'Bạn nhờ bạn tư vấn chọn quà.'],
  ['qr_friend_022', 'N3', 'friends', 'SNSって毎日どのくらい見てる？疲れることない？', 'エスエヌエスってまいにちどのくらいみてる？つかれることない？', 'Cậu lướt mạng xã hội mỗi ngày bao lâu? Có thấy mệt không?', 'Tán gẫu về thói quen dùng mạng xã hội.'],
  ['qr_friend_023', 'N3', 'friends', 'この前貸してくれた本、すごく面白かったよ！ありがとう。', 'このまえかしてくれたほん、すごくおもしろかったよ！ありがとう。', 'Cuốn sách cậu cho mượn hôm trước hay cực! Cảm ơn nhé.', 'Bạn trả sách lại cho bạn.'],
  ['qr_friend_024', 'N3', 'friends', '休みの日に一人で過ごすのと、みんなでワイワイするのどっちが好き？', 'やすみのひにひとりですごすのと、みんなでワイワイするのどっちがすき？', 'Ngày nghỉ cậu thích ở một mình hay tụ tập đông vui hơn?', 'Nói chuyện tính cách hướng nội/hướng ngoại.'],
  ['qr_friend_025', 'N3', 'friends', '実は来月引っ越すことになったんだ。手伝ってもらえたら嬉しいな。', 'じつはらいげつひっこすことになったんだ。てつだってもらえたらうれしいな。', 'Thực ra tháng sau mình chuyển nhà. Nếu cậu giúp được thì vui quá.', 'Bạn nhờ phụ chuyển nhà.'],
  ['qr_friend_026', 'N3', 'friends', '最近いい出会いあった？恋愛の話とか聞かせてよ！', 'さいきんいいであいあった？れんあいのはなしとかきかせてよ！', 'Dạo này có gặp ai hợp ý không? Kể chuyện tình cảm nghe với!', 'Bạn thân trêu chọc lúc đi café.'],
  ['qr_friend_027', 'N3', 'friends', 'もし宝くじで1億円当たったら、まず何に使う？', 'もしたからくじでいちおくえんあたったら、まずなににつかう？', 'Nếu trúng xổ số 100 triệu yên, việc đầu tiên cậu làm là gì?', 'Câu hỏi đùa vui với bạn bè.'],
  ['qr_friend_028', 'N3', 'friends', '約束していたのに忘れちゃって本当にごめん！埋め合わせさせて！', 'やくそくしていたのにわすれちゃってほんとうにごめん！うめあわせさせて！', 'Xin lỗi cậu nhiều vì đã quên mất cuộc hẹn! Để mình đền bù nhé!', 'Bạn xin lỗi vì lỡ hẹn.'],
  ['qr_friend_029', 'N2', 'friends', '大人になってから新しい友達を作るのって、意外と難しくない？', 'おとなになってからあたらしいともだちをつくるのって、いがいとむずかしくない？', 'Lớn rồi kết bạn mới thấy khó hơn tưởng tượng đúng không?', 'Tâm sự với bạn cùng tuổi.'],
  ['qr_friend_030', 'N2', 'friends', 'せっかく誘ってくれたのに断るのって気まずいよね。どう断ってる？', 'せっかくさそってくれたのにことわるのってきまずいよね。どうことわってる？', 'Người ta mất công rủ mà từ chối cũng ngại nhỉ. Cậu hay từ chối khéo thế nào?', 'Hỏi kinh nghiệm giao tiếp ở Nhật.'],
  ['qr_friend_031', 'N2', 'friends', '相手のことを思って注意したのに、逆に機嫌を損ねちゃって困ってるんだ。', 'あいてのことをおもってちゅういしたのに、ぎゃくにきげんをそこねちゃってこまってるんだ。', 'Mình góp ý vì tốt cho họ mà họ lại giận ngược lại, khó xử quá.', 'Bạn kể chuyện xích mích nhỏ.'],
  ['qr_friend_032', 'N2', 'friends', '趣味を通じて知り合った人って、話題が合うからすぐ仲良くなれるよね。', 'しゅみをつうじてしりあったひとって、わだいがあうからすぐなかよくなれるよね。', 'Quen qua sở thích chung nên hợp chuyện, dễ thân nhanh nhỉ.', 'Tán gẫu ở câu lạc bộ.'],
  ['qr_friend_033', 'N1', 'friends', '価値観が違う相手と長く付き合っていくコツって何だと思う？', 'かちかんがちがうあいてとながくつきあっていくコツってなんだとおもう？', 'Theo cậu bí quyết để duy trì mối quan hệ lâu dài với người khác quan điểm là gì?', 'Trò chuyện sâu sắc với bạn thân.'],
  ['qr_friend_034', 'N1', 'friends', '気を使いすぎずに自然体でいられる関係って貴重だよね。', 'きをつかいすぎずにしぜんたいでいられるかんけいってきちょうだよね。', 'Một mối quan hệ mà không cần giữ kẽ quá mức, cứ tự nhiên thật đáng quý nhỉ.', 'Tâm sự cùng người bạn lâu năm.'],

  // ======================== 6. WORK (36) ========================
  ['qr_work_001', 'N5', 'work', 'おはようございます！今日もよろしくお願いします。', 'おはようございます！きょうもよろしくおねがいします。', 'Chào buổi sáng! Hôm nay mong được mọi người giúp đỡ.', 'Vừa bước vào văn phòng / chỗ làm thêm.'],
  ['qr_work_002', 'N5', 'work', 'お疲れ様でした！お先に失礼します。', 'おつかれさまでした！おさきにしつれいします。', 'Mọi người vất vả rồi! Tôi xin phép về trước ạ.', 'Đồng nghiệp chào ra về cuối ngày.'],
  ['qr_work_003', 'N5', 'work', 'お仕事は何をしていますか？', 'おしごとはなにをしていますか？', 'Bạn đang làm công việc gì vậy?', 'Gặp người mới quen ở buổi giao lưu.'],
  ['qr_work_004', 'N5', 'work', '今、少し時間ありますか？', 'いま、すこしじかんありますか？', 'Bây giờ bạn có rảnh một chút không?', 'Đồng nghiệp lại gần bàn làm việc hỏi.'],
  ['qr_work_005', 'N5', 'work', '明日のシフトは何時から何時までですか？', 'あしたのシフトはなんじからなんじまでですか？', 'Ca làm ngày mai của bạn từ mấy giờ đến mấy giờ?', 'Hỏi lịch làm thêm (baito).'],
  ['qr_work_006', 'N5', 'work', 'コピー機、今使っていますか？', 'コピーき、いまつかっていますか？', 'Bạn có đang dùng máy photo không?', 'Đồng nghiệp hỏi ở khu vực máy in.'],
  ['qr_work_007', 'N4', 'work', 'これ、今日の夕方までに終わらせられますか？', 'これ、きょうのゆうがたまでにおわらせられますか？', 'Việc này bạn có làm xong trước chiều nay được không?', 'Quản lý giao thêm việc.'],
  ['qr_work_008', 'N4', 'work', '来週のシフト、水曜日の代わりに入ってくれる人探してるんだけど、入れる？', 'らいしゅうのシフト、すいようびのかわりにはいってくれるひとさがしてるんだけど、はいれる？', 'Đang tìm người làm thay ca thứ Tư tuần sau, cậu nhận được không?', 'Đồng nghiệp làm thêm nhờ đổi ca.'],
  ['qr_work_009', 'N4', 'work', '分からないことがあったら、いつでも聞いてね。', 'わからないことがあったら、いつでもきいてね。', 'Có gì không hiểu cứ hỏi bất cứ lúc nào nhé.', 'Tiền bối hướng dẫn nhân viên mới.'],
  ['qr_work_010', 'N4', 'work', '会議室は3階のBルームに変わったよ。知ってた？', 'かいぎしつはさんがいのビールームにかわったよ。しってた？', 'Phòng họp đổi sang phòng B tầng 3 rồi đấy. Biết chưa?', 'Đồng nghiệp nhắn trước giờ họp.'],
  ['qr_work_011', 'N4', 'work', '残業は月にどれくらいありますか？', 'ざんぎょうはつきにどれくらいありますか？', 'Một tháng bạn tăng ca khoảng bao nhiêu tiếng?', 'Trò chuyện về công việc với bạn.'],
  ['qr_work_012', 'N4', 'work', 'アルバイトの面接で、どうしてうちに応募したのか教えてください。', 'アルバイトのめんせつで、どうしてうちにおうぼしたのかおしえてください。', 'Trong buổi phỏng vấn baito, hãy cho biết lý do bạn ứng tuyển quán chúng tôi.', 'Phỏng vấn xin việc làm thêm.'],
  ['qr_work_013', 'N4', 'work', '週に何日くらいシフトに入れますか？', 'しゅうになんにちくらいシフトにはいれますか？', 'Mỗi tuần bạn có thể đi làm khoảng mấy buổi?', 'Quản lý hỏi khi phỏng vấn baito.'],
  ['qr_work_014', 'N4', 'work', 'お昼休憩、そろそろ行きませんか？', 'おひるきゅうけい、そろそろいきませんか？', 'Sắp đến giờ nghỉ trưa rồi, đi ăn không?', 'Đồng nghiệp rủ nghỉ trưa.'],
  ['qr_work_015', 'N3', 'work', 'さっき送ったメール、確認していただけましたか？', 'さっきおくったメール、かくにんしていただけましたか？', 'Email tôi vừa gửi lúc nãy bạn đã xem qua chưa?', 'Đồng nghiệp xác nhận lại qua chat.'],
  ['qr_work_016', 'N3', 'work', '今のタスク、進捗はどうですか？順調に進んでいますか？', 'いまのタスク、しんちょくはどうですか？じゅんちょうにすすんでいますか？', 'Tiến độ task hiện tại sao rồi? Mọi thứ ổn chứ?', 'Leader hỏi tiến độ trong buổi họp sáng (Daily standup).'],
  ['qr_work_017', 'N3', 'work', 'リモートワークと出社、どっちのほうが集中できますか？', 'リモートワークとしゅっしゃ、どっちのほうがしゅうちゅうできますか？', 'Làm việc từ xa hay lên công ty thì bạn tập trung hơn?', 'Trò chuyện văn hóa làm việc.'],
  ['qr_work_018', 'N3', 'work', '資料にちょっと修正点が見つかったんですが、直してもらえますか？', 'しりょうにちょっとしゅうせいてんがみつかったんですが、なおしてもらえますか？', 'Tài liệu có vài chỗ cần sửa, bạn chỉnh lại giúp được không?', 'Đồng nghiệp review tài liệu của bạn.'],
  ['qr_work_019', 'N3', 'work', '来週有給を取りたいんですが、業務の引き継ぎはどうしましょうか？', 'らいしゅうゆうきゅうをとりたいんですが、ぎょうむのひきつぎはどうしましょうか？', 'Tôi định xin nghỉ phép tuần sau, việc bàn giao nên làm thế nào?', 'Trao đổi bàn giao công việc.'],
  ['qr_work_020', 'N3', 'work', '最近仕事量が増えて大変そうだけど、手伝おうか？', 'さいきんしごとりょうがふえてたいへんそうだけど、てつだおうか？', 'Gần đây thấy khối lượng việc của bạn nhiều quá, để mình phụ một tay nhé?', 'Đồng nghiệp ngỏ ý hỗ trợ.'],
  ['qr_work_021', 'N3', 'work', 'すみません、添付ファイルがついていなかったみたいです。', 'すみません、てんぷファイルがついていなかったみたいです。', 'Xin lỗi, hình như email bạn quên đính kèm file rồi.', 'Đồng nghiệp nhắc lỗi gửi email.'],
  ['qr_work_022', 'N3', 'work', 'この件について、あなたの意見も聞かせてもらえますか？', 'このけんについて、あなたのいけんもきかせてもらえますか？', 'Về vấn đề này, bạn có thể chia sẻ ý kiến của mình không?', 'Trong cuộc họp nhóm.'],
  ['qr_work_023', 'N3', 'work', '面接の最後に、何かこちらに質問はありますか？', 'めんせつのさいごに、なにかこちらにしつもんはありますか？', 'Cuối buổi phỏng vấn, bạn có câu hỏi nào dành cho công ty không?', 'Câu hỏi kinh điển cuối buổi phỏng vấn.'],
  ['qr_work_024', 'N3', 'work', 'あなたの強みと弱みを簡単に教えてください。', 'あなたのつよみとよわみをかんたんにおしえてください。', 'Hãy giới thiệu ngắn gọn điểm mạnh và điểm yếu của bạn.', 'Phỏng vấn xin việc tại Nhật.'],
  ['qr_work_025', 'N2', 'work', '来週の会議の資料、今の進捗状況を教えていただけますか？', 'らいしゅうのかいぎのしりょう、いまのしんちょくじょうきょうをおしえていただけますか？', 'Bạn có thể cho biết tiến độ chuẩn bị tài liệu họp tuần sau không?', 'Cấp trên hỏi tiến độ.'],
  ['qr_work_026', 'N2', 'work', '今回のプロジェクトで一番苦労した点は何でしたか？', 'こんかいのプロジェクトでいちばんくろうしたてんはなんでしたか？', 'Trong dự án lần này, điểm nào khiến bạn vất vả nhất?', 'Họp tổng kết dự án / phỏng vấn IT.'],
  ['qr_work_027', 'N2', 'work', 'テスト中に重大なバグが見つかったんですが、リリース日を延期すべきでしょうか？', 'テストちゅうにじゅうだいなバグがみつかったんですが、リリースびをえんきすべきでしょうか？', 'Phát hiện bug nghiêm trọng lúc test, liệu có nên lùi ngày release không?', 'Trao đổi khẩn với team kỹ thuật.'],
  ['qr_work_028', 'N2', 'work', 'お客様から仕様変更の依頼が来たんですが、工数はどのくらいかかりそうですか？', 'おきゃくさまからしようへんこうのいらいがきたんですが、こうすうはどのくらいかかりそうですか？', 'Khách hàng gửi yêu cầu đổi spec, ước lượng mất khoảng bao nhiêu công?', 'PM hỏi ước lượng thời gian.'],
  ['qr_work_029', 'N2', 'work', '先日のご提案について、社内で検討した結果をご連絡いたします。', 'せんじつのごていあんについて、しゃないだけんとうしたけっかをごれんらくいたします。', 'Về đề xuất hôm trước, chúng tôi xin phản hồi kết quả sau khi bàn nội bộ.', 'Trao đổi công việc với đối tác.'],
  ['qr_work_030', 'N2', 'work', '急なお願いで恐縮ですが、本日の打ち合わせを1時間後ろ倒しにできますか？', 'きゅうなおねがいできょうしゅくですが、ほんじつのうちあわせをいちじかんうしろだおしにできますか？', 'Xin lỗi vì đề nghị đột xuất, có thể lùi buổi họp hôm nay muộn 1 tiếng không?', 'Đối tác / sếp xin dời giờ họp.'],
  ['qr_work_031', 'N2', 'work', 'この業務プロセス、もっと効率化できる方法はないでしょうか？', 'このぎょうむプロセス、もっとこうりつかできるほうほうはないでしょうか？', 'Quy trình làm việc này có cách nào làm hiệu quả hơn không?', 'Họp cải tiến quy trình.'],
  ['qr_work_032', 'N2', 'work', '転職を考えているんですが、今の会社に残るべきか迷っています。', 'てんしょくをかんがえているんですが、いまのかいしゃにのこるべきかまよっています。', 'Mình đang tính chuyển việc nhưng phân vân không biết có nên ở lại không.', 'Tâm sự nghề nghiệp với đồng nghiệp thân.'],
  ['qr_work_033', 'N1', 'work', 'スケジュール短縮のご相談ですが、どのような代替案が考えられますでしょうか？', 'スケジュールたんしゅくのごそうだんですが、どのようなだいたいあんがかんがえられますでしょうか？', 'Về việc rút ngắn tiến độ, phía bạn đề xuất phương án thay thế nào?', 'Đàm phán với khách hàng lớn.'],
  ['qr_work_034', 'N1', 'work', 'AIの普及によって、私たちの仕事は今後どう変わっていくと思いますか？', 'エーアイのふきゅうによって、わたしたちのしごとはこんごどうかわっていくとおもいますか？', 'Theo bạn với sự phổ biến của AI, công việc của chúng ta sẽ thay đổi ra sao?', 'Thảo luận chuyên môn / phỏng vấn cấp cao.'],
  ['qr_work_035', 'N1', 'work', 'チーム内の意見が真っ二つに分かれたとき、どうやって合意形成を図っていますか？', 'チームないのいけんがまっぷたつにわかれたとき、どうやってごういけいせいをはかっていますか？', 'Khi ý kiến trong nhóm chia đôi, bạn thường tạo đồng thuận bằng cách nào?', 'Phỏng vấn vị trí quản lý / senior.'],
  ['qr_work_036', 'N1', 'work', '今回のクレーム対応について、再発防止策をまとめて報告してもらえますか？', 'こんかいのクレームたいおうについて、さいはつぼうしさくをまとめてほうこくしてもらえますか？', 'Về vụ khiếu nại lần này, bạn tổng hợp biện pháp phòng tái diễn rồi báo cáo nhé?', 'Sếp giao xử lý sự cố khách hàng.'],

  // ======================== 7. STUDY (26) ========================
  ['qr_study_001', 'N5', 'study', '日本語を勉強してどのくらいになりますか？', 'にほんごをべんきょうしてどのくらいになりますか？', 'Bạn học tiếng Nhật được bao lâu rồi?', 'Câu hỏi quen thuộc khi gặp người Nhật.'],
  ['qr_study_002', 'N5', 'study', '日本語の勉強で何が一番難しいですか？', 'にほんごのべんきょうでなにがいちばんむずかしいですか？', 'Trong việc học tiếng Nhật cái gì khó nhất với bạn?', 'Giáo viên / bạn Nhật hỏi.'],
  ['qr_study_003', 'N5', 'study', '漢字はどうやって覚えていますか？', 'かんじはどうやっておぼえていますか？', 'Bạn học thuộc chữ Hán bằng cách nào?', 'Bạn cùng lớp hỏi bí quyết học Kanji.'],
  ['qr_study_004', 'N5', 'study', '昨日の宿題、もう終わりましたか？', 'きのうのしゅくだい、もうおわりましたか？', 'Bài tập về nhà hôm qua bạn làm xong chưa?', 'Trước giờ vào lớp.'],
  ['qr_study_005', 'N5', 'study', 'ペンを忘れちゃった！一本貸してくれる？', 'ペンをわすれちゃった！いっぽんかしてくれる？', 'Mình quên bút mất rồi! Cho mượn một cây nhé?', 'Bạn ngồi cùng bàn hỏi mượn đồ.'],
  ['qr_study_006', 'N5', 'study', 'テストはどうでしたか？よくできましたか？', 'テストはどうでしたか？よくできましたか？', 'Bài kiểm tra thế nào? Làm tốt không?', 'Sau giờ thi ở trường.'],
  ['qr_study_007', 'N4', 'study', 'どうして日本語を勉強しようと思いましたか？', 'どうしてにほんごをべんきょうしようとおもいましたか？', 'Tại sao bạn quyết định học tiếng Nhật?', 'Giáo viên hỏi động lực học.'],
  ['qr_study_008', 'N4', 'study', '次のJLPT、何級を受ける予定ですか？', 'つぎのジェーエルピーティー、なんきゅうをうけるよていですか？', 'Kỳ thi JLPT tới bạn định thi cấp độ nào?', 'Hỏi chuyện thi cử tiếng Nhật.'],
  ['qr_study_009', 'N4', 'study', '図書館で一緒に勉強しない？集中できそうだよ。', 'としょかんでいっしょにべんきょうしない？しゅうちゅうできそうだよ。', 'Ra thư viện học cùng không? Chắc dễ tập trung hơn đấy.', 'Bạn rủ đi học nhóm.'],
  ['qr_study_010', 'N4', 'study', 'この文法の意味、いまいちピンとこないんだよね。説明してくれる？', 'このぶんぽうのいみ、いまいちピンとこないんだよね。せつめいしてくれる？', 'Nghĩa ngữ pháp này mình vẫn hơi mơ hồ. Cậu giải thích giúp được không?', 'Bạn cùng lớp hỏi bài.'],
  ['qr_study_011', 'N4', 'study', '毎日どのくらい日本語を勉強していますか？', 'まいにちどのくらいにほんごをべんきょうしていますか？', 'Mỗi ngày bạn học tiếng Nhật khoảng bao lâu?', 'Chia sẻ lịch tự học.'],
  ['qr_study_012', 'N4', 'study', '聞き取りの練習、何かいいアプリやYouTube知ってる？', 'ききとりのれんしゅう、なにかいいアプリやユーチューブしってる？', 'Luyện nghe cậu có biết app hay kênh YouTube nào hay không?', 'Trao đổi tài liệu học tiếng Nhật.'],
  ['qr_study_013', 'N4', 'study', 'ノート見せてもらってもいい？昨日休んじゃって。', 'ノートみせてもらってもいい？きのうやすんじゃって。', 'Cho mình xem vở ghi chép được không? Hôm qua mình nghỉ học.', 'Bạn cùng lớp mượn vở.'],
  ['qr_study_014', 'N3', 'study', '会話力を伸ばすには、やっぱり実際に話すのが一番だよね？', 'かいわりょくをのばすには、やっぱりじっさいにはなすのがいちばんだよね？', 'Để tăng kỹ năng giao tiếp thì đúng là phải thực hành nói nhiều nhất nhỉ?', 'Thảo luận cách học ngoại ngữ.'],
  ['qr_study_015', 'N3', 'study', '読解のスピードが上がらなくて、いつも時間が足りなくなるんです。', 'どっかいのスピードがあがらなくて、いつもじかんがたりなくなるんです。', 'Tốc độ đọc hiểu không tăng được nên thi lúc nào cũng thiếu giờ.', 'Bạn than phiền về phần đọc hiểu JLPT.'],
  ['qr_study_016', 'N3', 'study', 'せっかく覚えた単語も、使わないとすぐ忘れちゃうよね。', 'せっかくおぼえたたんごも、つかわないとすぐわすれちゃうよね。', 'Từ vựng mất công học thuộc mà không dùng là quên ngay nhỉ.', 'Tâm sự chuyện học từ vựng.'],
  ['qr_study_017', 'N3', 'study', '敬語って本当にややこしいよね。もう慣れた？', 'けいごってほんとうにややこしいよね。もうなれた？', 'Kính ngữ rắc rối thật đấy. Cậu đã quen dùng chưa?', 'Trò chuyện giữa những người học tiếng Nhật.'],
  ['qr_study_018', 'N3', 'study', '勉強のモチベーションが下がったとき、どうやって立て直していますか？', 'べんきょうのモチベーションがさがったとき、どうやってたてなおしていますか？', 'Lúc tụt động lực học tập bạn lấy lại tinh thần bằng cách nào?', 'Hỏi kinh nghiệm duy trì thói quen học.'],
  ['qr_study_019', 'N3', 'study', '日本語以外に勉強してみたい言語はありますか？', 'にほんごいがいにべんきょうしてみたいげんごはありますか？', 'Ngoài tiếng Nhật bạn còn muốn học thêm ngoại ngữ nào không?', 'Trò chuyện về ngoại ngữ.'],
  ['qr_study_020', 'N3', 'study', '来週のプレゼン発表、準備はもうバッチリ？', 'らいしゅうのプレゼンはっぴょう、じゅんびはもうバッチリ？', 'Bài thuyết trình tuần sau chuẩn bị xong xuôi hết chưa?', 'Bạn cùng lớp hỏi thăm.'],
  ['qr_study_021', 'N2', 'study', '資格の勉強と仕事の両立って、スケジュール管理が難しくないですか？', 'しかくのべんきょうとしごとのりょうりつって、スケジュールかんりがむずかしくないですか？', 'Vừa đi làm vừa ôn chứng chỉ quản lý thời gian có khó không?', 'Nói chuyện với đồng nghiệp.'],
  ['qr_study_022', 'N2', 'study', 'ネイティブみたいな自然な表現を身につけるにはどうしたらいいかな？', 'ネイティブみたいなしぜんなひょうげんをみにつけるにはどうしたらいいかな？', 'Làm sao để dùng được những cách diễn đạt tự nhiên như người bản xứ nhỉ?', 'Hỏi mẹo nâng trình tiếng Nhật.'],
  ['qr_study_023', 'N2', 'study', '日本の大学や専門学校に進学しようと思ったきっかけは何ですか？', 'にほんのだいがくやせんもんがっこうにしんがくしようとおもったきっかけはなんですか？', 'Cơ duyên nào khiến bạn muốn học lên đại học/senmon ở Nhật?', 'Phỏng vấn nhập học hoặc trò chuyện.'],
  ['qr_study_024', 'N2', 'study', '独学でここまで話せるようになったなんてすごいですね！コツは何ですか？', 'どくがくでここまではなせるようになったなんてすごいですね！コツはなんですか？', 'Tự học mà nói được đến mức này giỏi quá! Bí quyết là gì thế?', 'Người Nhật khen tiếng Nhật của bạn.'],
  ['qr_study_025', 'N1', 'study', '語学学習において、文法重視と実践重視のバランスはどう考えていますか？', 'ごがくがくしゅうにおいて、ぶんぽうじゅうしとじっせんじゅうしのバランスはどうかんがえていますか？', 'Trong việc học ngoại ngữ bạn nghĩ nên cân bằng giữa ngữ pháp và thực hành thế nào?', 'Thảo luận phương pháp học.'],
  ['qr_study_026', 'N1', 'study', '専門書を日本語で読むとき、分からない表現はどう処理していますか？', 'せんもんしょをにほんごでよむとき、わからないひょうげんはどうしょりしていますか？', 'Khi đọc sách chuyên ngành tiếng Nhật, gặp cụm từ không hiểu bạn xử lý ra sao?', 'Trao đổi kỹ năng đọc chuyên sâu.'],

  // ======================== 8. HEALTH (26) ========================
  ['qr_health_001', 'N5', 'health', '顔色が悪いよ。大丈夫？', 'かおいろがわるいよ。だいじょうぶ？', 'Sắc mặt cậu kém quá. Có sao không?', 'Bạn thấy bạn trông mệt mỏi.'],
  ['qr_health_002', 'N5', 'health', '今日はどうされましたか？どこが痛いですか？', 'きょうはどうされましたか？どこがいたいですか？', 'Hôm nay bạn thấy thế nào? Đau ở đâu ạ?', 'Bác sĩ hỏi khi bạn vào phòng khám.'],
  ['qr_health_003', 'N5', 'health', '熱はありますか？何度くらいですか？', 'ねつはありますか？なんどくらいですか？', 'Bạn có bị sốt không? Khoảng bao nhiêu độ?', 'Y tá hỏi trước khi khám.'],
  ['qr_health_004', 'N5', 'health', 'いつからその症状がありますか？', 'いつからそのしょうじょうがありますか？', 'Triệu chứng đó bắt đầu từ khi nào?', 'Bác sĩ hỏi bệnh sử.'],
  ['qr_health_005', 'N5', 'health', '薬はちゃんと飲みましたか？', 'くすりはちゃんとのみましたか？', 'Bạn đã uống thuốc đầy đủ chưa?', 'Bạn bè hỏi thăm lúc bạn bị ốm.'],
  ['qr_health_006', 'N5', 'health', '保険証はお持ちですか？', 'ほけんしょうはおもちですか？', 'Bạn có mang theo thẻ bảo hiểm y tế không?', 'Lễ tân phòng khám hỏi.'],
  ['qr_health_007', 'N4', 'health', '昨日、具合が悪いって聞いたけど、もう大丈夫ですか？', 'きのう、ぐあいがわるいってきいたけど、もうだいじょうぶですか？', 'Hôm qua nghe nói bạn không khỏe, nay đã đỡ chưa?', 'Đồng nghiệp hỏi thăm sức khỏe.'],
  ['qr_health_008', 'N4', 'health', '薬のアレルギーや、今飲んでいるお薬はありますか？', 'くすりのアレルギーや、いまのんでいるおくすりはありますか？', 'Bạn có dị ứng thuốc nào hay đang uống thuốc gì khác không?', 'Dược sĩ tại hiệu thuốc hỏi.'],
  ['qr_health_009', 'N4', 'health', '花粉症は大丈夫ですか？春になると辛いですよね。', 'かふんしょうはだいじょうぶですか？はるになるとつらいですよね。', 'Bạn có bị dị ứng phấn hoa không? Mùa xuân đến khổ lắm nhỉ.', 'Nói chuyện vào mùa xuân ở Nhật.'],
  ['qr_health_010', 'N4', 'health', '眠くなりにくい風邪薬がいいですか？', 'ねむくなりにくいかぜぐすりがいいですか？', 'Bạn muốn chọn loại thuốc cảm ít gây buồn ngủ đúng không?', 'Dược sĩ tư vấn mua thuốc.'],
  ['qr_health_011', 'N4', 'health', '最近、肩こりや腰痛に悩んでいませんか？', 'さいきん、かたこりやようつうになやんでいませんか？', 'Gần đây bạn có bị đau mỏi vai gáy hay đau lưng không?', 'Nói chuyện với dân văn phòng.'],
  ['qr_health_012', 'N4', 'health', '無理しないで、今日は早めに帰って休んだほうがいいよ。', 'むりしないで、きょうははやめにかえってやすんだほうがいいよ。', 'Đừng cố quá, hôm nay về sớm nghỉ ngơi đi nhé.', 'Đồng nghiệp khuyên khi bạn đang ho.'],
  ['qr_health_013', 'N4', 'health', 'このお薬は1日3回、食後に飲んでくださいね。', 'このおくすりはいちにちさんかい、しょくごにのんでくださいね。', 'Thuốc này uống ngày 3 lần sau bữa ăn nhé.', 'Dược sĩ dặn dò cách uống thuốc.'],
  ['qr_health_014', 'N4', 'health', '歯医者の定期検診、ちゃんに行っていますか？', 'はいしゃのていきけんしん、ちゃんといっていますか？', 'Bạn có đi khám răng định kỳ đều đặn không?', 'Nói chuyện về chăm sóc sức khỏe.'],
  ['qr_health_015', 'N3', 'health', '最近よく眠れていますか？寝つきが悪いことはないですか？', 'さいきんよくねむれていますか？ねつきがわるいことはないですか？', 'Gần đây bạn ngủ có ngon giấc không? Có khó ngủ không?', 'Bác sĩ / bạn thân hỏi thăm.'],
  ['qr_health_016', 'N3', 'health', '健康診断の結果はどうでしたか？何か引っかかりましたか？', 'けんこうしんだんのけっかはどうでしたか？なにかひっかかりましたか？', 'Kết quả khám sức khỏe định kỳ sao rồi? Có chỉ số nào bất thường không?', 'Đồng nghiệp hỏi sau đợt khám công ty.'],
  ['qr_health_017', 'N3', 'health', '風邪をひかないように普段どんな予防をしていますか？', 'かぜをひかないようにふだんどんなよぼうをしていますか？', 'Thường ngày bạn phòng ngừa cảm cúm bằng cách nào?', 'Trò chuyện mùa đông.'],
  ['qr_health_018', 'N3', 'health', 'ジムに通おうか迷っているんですが、続けるコツってありますか？', 'ジムにかよおうかまよっているんですが、つづけるコツってありますか？', 'Mình đang tính đi tập gym nhưng không biết bí quyết duy trì đều đặn là gì?', 'Bạn hỏi kinh nghiệm tập thể thao.'],
  ['qr_health_019', 'N3', 'health', '季節の変わり目なので、体調を崩しやすいですよね。気をつけてください。', 'きせつのかわりめなので、たいちょうをくずしやすいですよね。きをつけてください。', 'Đang lúc giao mùa nên dễ ốm lắm. Bạn giữ gìn sức khỏe nhé.', 'Lời hỏi thăm lịch sự.'],
  ['qr_health_020', 'N3', 'health', 'お腹の調子が悪いときは、どんなものを食べるようにしていますか？', 'おなかのちょうしがわるいときは、どんなものをたべるようにしていますか？', 'Khi bụng dạ không ổn bạn thường ăn món gì cho dễ tiêu?', 'Hỏi thăm lúc hơi đau bụng.'],
  ['qr_health_021', 'N3', 'health', '病院を予約したいんですが、初診でも大丈夫か確認したほうがいいですよね？', 'びょういんをよやくしたいんですが、しょしんでもだいじょうぶかかくにんしたほうがいいですよね？', 'Định đặt lịch phòng khám, nên hỏi xem khám lần đầu có nhận không nhỉ?', 'Bạn hỏi kinh nghiệm đi viện ở Nhật.'],
  ['qr_health_022', 'N2', 'health', 'デスクワークが続くと運動不足になりがちなので、何か対策していますか？', 'デスクワークがつづくとうんどうぶそくになりがちなので、なにかたいさくしていますか？', 'Ngồi máy tính suốt dễ thiếu vận động, bạn có cách nào khắc phục không?', 'Trao đổi lối sống lành mạnh.'],
  ['qr_health_023', 'N2', 'health', '症状が3日以上続くようでしたら、もう一度受診してくださいね。', 'しょうじょうがみっかいじょうつづくようでしたら、もういちどじゅしんしてくださいね。', 'Nếu triệu chứng kéo dài quá 3 ngày thì bạn nhớ quay lại tái khám nhé.', 'Bác sĩ dặn trước khi ra về.'],
  ['qr_health_024', 'N2', 'health', 'ダイエットを始めたんですが、つい甘いものを食べてしまいます。', 'ダイエットをはじめたんですが、ついあまいものをたべてしまいます。', 'Mình mới bắt đầu ăn kiêng mà cứ lỡ miệng ăn đồ ngọt suốt.', 'Bạn tâm sự chuyện giảm cân.'],
  ['qr_health_025', 'N2', 'health', 'メンタルヘルスを保つために、休日に心がけていることはありますか？', 'メンタルヘルスをたもつために、きゅうじつにこころがけていることはありますか？', 'Để giữ tinh thần khỏe mạnh, ngày nghỉ bạn thường chú ý làm gì?', 'Trò chuyện sâu về sức khỏe tinh thần.'],
  ['qr_health_026', 'N1', 'health', '予防医療の大切さが叫ばれていますが、生活習慣で見直したい点はありますか？', 'よぼういりょうのたいせつさがさけばれていますが、せいかつしゅうかんでみなおしたいテンはありますか？', 'Y học dự phòng rất quan trọng, bạn có thói quen sinh hoạt nào muốn thay đổi không?', 'Thảo luận về sức khỏe.'],

  // ======================== 9. HOME (30) ========================
  ['qr_home_001', 'N5', 'home', '今、どんな部屋に住んでいますか？', 'いま、どんなへやにすんでいますか？', 'Hiện tại bạn đang sống trong căn phòng như thế nào?', 'Hỏi chuyện nhà ở.'],
  ['qr_home_002', 'N5', 'home', '宅配便です！こちらにサインをお願いします。', 'たくはいびんです！こちらにサインをおねがいします。', 'Giao hàng đây ạ! Phiền bạn ký nhận vào đây nhé.', 'Nhân viên giao hàng Yamato/Sagawa bấm chuông.'],
  ['qr_home_003', 'N5', 'home', '燃えるゴミの日って何曜日だっけ？', 'もえるゴミのひってなんようびだっけ？', 'Ngày đổ rác đốt được là thứ mấy ấy nhỉ?', 'Bạn cùng phòng hỏi.'],
  ['qr_home_004', 'N5', 'home', 'お部屋、綺麗ですね！いつも掃除してるんですか？', 'おへや、きれいですね！いつもそうじしてるんですか？', 'Phòng bạn sạch sẽ quá! Lúc nào bạn cũng dọn dẹp à?', 'Bạn đến chơi nhà khen.'],
  ['qr_home_005', 'N5', 'home', 'エアコンつけてもいい？ちょっと暑くない？', 'エアコンつけてもいい？ちょっとあつくない？', 'Bật điều hòa được không? Hơi nóng đúng không?', 'Bạn đang ngồi trong phòng bạn.'],
  ['qr_home_006', 'N5', 'home', '最寄り駅から家まで歩いて何分くらいですか？', 'もよりえきからいえまであるいてなんぷんくらいですか？', 'Từ ga gần nhất đi bộ về nhà bạn mất khoảng mấy phút?', 'Hỏi thăm nơi ở.'],
  ['qr_home_007', 'N4', 'home', '一人暮らしはどうですか？楽しいですか？それとも寂しい？', 'ひとりぐらしはどうですか？たのしいですか？それともさみしい？', 'Sống một mình thấy thế nào? Vui hay có lúc thấy buồn?', 'Bạn hỏi cảm nhận khi ở riêng.'],
  ['qr_home_008', 'N4', 'home', 'ペットボトルとビン・カンって、分けて捨てないといけないんだよね？', 'ペットボトルとビン・カンって、わけてすてないといけないんだよね？', 'Chai nhựa với chai thủy tinh/lon phải phân loại riêng ra để vứt đúng không?', 'Người mới sang Nhật hỏi cách phân loại rác.'],
  ['qr_home_009', 'N4', 'home', '今度引っ越すなら、どんな条件の部屋がいいですか？', 'こんどひっこすなら、どんなじょうけんのへやがいいですか？', 'Nếu sắp tới chuyển nhà bạn muốn phòng có điều kiện gì?', 'Hỏi về tiêu chí thuê phòng.'],
  ['qr_home_010', 'N4', 'home', '不在票が入っていたんだけど、再配達の頼み方わかる？', 'ふざいひょうがはいっていたんだけど、さいはいたつのたのみかたわかる？', 'Có giấy báo vắng nhà giao hàng, cậu biết cách đặt giao lại không?', 'Bạn hỏi chuyện nhận bưu kiện ở Nhật.'],
  ['qr_home_011', 'N4', 'home', '部屋のWi-Fi、調子どう？なんか今日遅くない？', 'へやのワイファイ、ちょうしどう？なんかきょうおそくない？', 'Wi-Fi phòng sao thế? Nay thấy hơi chậm đúng không?', 'Hỏi chuyện mạng internet ở nhà.'],
  ['qr_home_012', 'N4', 'home', '近所は静かで住みやすいですか？', 'きんじょはしずかですみやすいですか？', 'Khu xung quanh nhà bạn có yên tĩnh và dễ sống không?', 'Đồng nghiệp hỏi thăm nơi ở mới.'],
  ['qr_home_013', 'N4', 'home', 'すみません、住民票を取りに来たんですが、どの窓口に行けばいいですか？', 'すみません、じゅうみんひょうをとりにきたんですが、どのまどぐちにいけばいいですか？', 'Xin lỗi tôi đến lấy giấy cư trú (Juminhyo), nên tới quầy nào?', 'Thực hành phản xạ ở ủy ban quận (Kuyakusho).'],
  ['qr_home_014', 'N4', 'home', '郵便局からベトナムへ荷物を送りたいんですが、何日くらいかかりますか？', 'ゆうびんきょくからベトナムへにもつをおくりたいんですが、なんにちくらいかかりますか？', 'Muốn gửi đồ từ bưu điện về Việt Nam thì mất khoảng mấy ngày?', 'Hỏi chuyện gửi đồ quốc tế.'],
  ['qr_home_015', 'N3', 'home', 'どのような条件でお部屋をお探しでしょうか？ご予算はいくらくらいですか？', 'どのようなじょうけんでおへやをおさがしでしょうか？ごよさんはいくらくらいですか？', 'Bạn đang tìm phòng với điều kiện thế nào? Ngân sách khoảng bao nhiêu ạ?', 'Nhân viên bất động sản hỏi.'],
  ['qr_home_016', 'N3', 'home', 'エアコンから水漏れしているみたいなんですが、管理会社に連絡したほうがいいですよね？', 'エアコンからみずもれしているみたいなんですが、かんりがいしゃにれんらくしたほうがいいですよね？', 'Điều hòa hình như bị rỉ nước, nên gọi công ty quản lý nhà đúng không?', 'Sự cố trong căn hộ thuê.'],
  ['qr_home_017', 'N3', 'home', '上の階の足音が夜中に結構響くんですが、どう対処したらいいと思いますか？', 'うえのかいのあしおとがよなかにけっこうひびくんですが、どうたいしょしたらいいとおもいますか？', 'Tiếng bước chân tầng trên ban đêm vọng xuống khá ồn, nên xử lý thế nào nhỉ?', 'Hỏi kinh nghiệm xử lý tiếng ồn hàng xóm.'],
  ['qr_home_018', 'N3', 'home', '銀行口座を開設したいんですが、印鑑と在留カード以外に何が必要ですか？', 'ぎんこうこうざをかいせつしたいんですが、いんかんとざいりゅうカードいがいにになにがひつようですか？', 'Muốn mở tài khoản ngân hàng, ngoài con dấu và thẻ ngoại kiều còn cần gì?', 'Bạn mới sang Nhật hỏi thủ tục.'],
  ['qr_home_019', 'N3', 'home', '更新料が来月かかるから、更新するか引っ越すか迷っているんだ。', 'こうしんりょうがらいげつかかるから、こうしんするかひっこすかまよっているんだ。', 'Tháng sau tới hạn đóng phí gia hạn hợp đồng nhà, đang phân vân ở tiếp hay chuyển.', 'Tâm sự chuyện thuê nhà ở Nhật.'],
  ['qr_home_020', 'N3', 'home', '粗大ゴミってコンビニでシールを買ってから出すんですよね？', 'そだいゴミってコンビニでシールをかってからだすんですよね？', 'Rác cỡ lớn phải mua tem ở Konbini dán rồi mới mang ra đúng không?', 'Hỏi cách bỏ đồ nội thất cũ.'],
  ['qr_home_021', 'N3', 'home', '電気代とガス代、冬になると一気に高くなりますよね。節約してますか？', 'でんきだいとガスだい、ふゆになるとにいっきにたかくなりますよね。せつやくしてますか？', 'Tiền điện và ga cứ vào mùa đông là tăng vọt nhỉ. Bạn có mẹo tiết kiệm không?', 'Nói chuyện sinh hoạt phí.'],
  ['qr_home_022', 'N3', 'home', '引っ越しの挨拶って、やっぱり隣の部屋には行ったほうがいいのかな？', 'ひっこしのあいさつって、やっぱりとなりのへやにはいったほうがいいのかな？', 'Chuyển nhà mới đến có nên qua chào hỏi phòng bên cạnh không nhỉ?', 'Hỏi phong tục sống ở Nhật.'],
  ['qr_home_023', 'N3', 'home', '家具や家電は新品で買いましたか？それともリサイクルショップ？', 'かぐやかでんはしんぴんでかいましたか？それともリサイクルショップ？', 'Đồ nội thất và điện gia dụng bạn mua mới hay mua ở tiệm đồ cũ?', 'Hỏi kinh nghiệm sắm đồ phòng trọ.'],
  ['qr_home_024', 'N3', 'home', '防災グッズって家に用意してありますか？地震が怖いですよね。', 'ぼうさいグッズっていえによういしてありますか？じしんがこわいですよね。', 'Ở nhà bạn đã chuẩn bị đồ phòng chống thiên tai chưa? Động đất đáng sợ thật.', 'Nói chuyện phòng chống động đất ở Nhật.'],
  ['qr_home_025', 'N2', 'home', '退去時の立ち会いって、敷金はどれくらい戻ってくるものなんですか？', 'たいきょじのたちあいって、しききんはどれくらいもどってくるものなんですか？', 'Khi kiểm tra trả nhà, thường tiền đặt cọc được hoàn lại khoảng bao nhiêu?', 'Chuẩn bị trả phòng thuê.'],
  ['qr_home_026', 'N2', 'home', '転出届と転入届って、引っ越しから何日以内に手続きしないといけませんか？', 'てんしゅつとどけとてんにゅうとどけって、ひっこしからなんにちいないにてつづきしないといけませんか？', 'Giấy chuyển đi và chuyển đến phải làm trong vòng bao nhiêu ngày sau khi chuyển nhà?', 'Hỏi thủ tục hành chính.'],
  ['qr_home_027', 'N2', 'home', 'シェアハウスとワンルームの一人暮らし、それぞれのメリットって何だと思いますか？', 'シェアハウスとワンルームのひとりぐらし、それぞれのメリットってなんだとおもいますか？', 'Ở sharehouse và thuê phòng 1K ở riêng, bạn thấy mỗi bên có ưu điểm gì?', 'So sánh hình thức nhà ở.'],
  ['qr_home_028', 'N2', 'home', '部屋の模様替えをしたいんですが、狭い部屋を広く見せる工夫ってありますか？', 'へやのもようがえをしたいんですが、せまいへやをひろくみせるくふうってありますか？', 'Mình muốn sắp xếp lại phòng, có mẹo nào làm phòng nhỏ trông rộng hơn không?', 'Trao đổi trang trí phòng.'],
  ['qr_home_029', 'N2', 'home', 'マイナンバーカードの更新通知が来たんですが、オンラインでも申請できますか？', 'マイナンバーカードのこうしんつうちがきたんですが、オンラインでもしんせいできますか？', 'Có thông báo gia hạn thẻ My Number, có đăng ký online được không?', 'Hỏi thủ tục giấy tờ ở Nhật.'],
  ['qr_home_030', 'N1', 'home', '将来的に日本に永住するか、いずれ帰国するか、今のところどう考えていますか？', 'しょうらいてきににほんにえいじゅうするか、いずれきこくするか、いまのところどうかんがえていますか？', 'Về lâu dài bạn nghĩ sẽ định cư ở Nhật hay sau này sẽ về nước?', 'Cuộc trò chuyện nghiêm túc về tương lai.'],

  // ======================== 10. SOCIAL & REACTIONS (32) ========================
  ['qr_soc_001', 'N5', 'social', 'もしもし！今、電話しても大丈夫？', 'もしもし！いま、でんわしてもだいじょうぶ？', 'Alo! Bây giờ gọi điện có tiện nói chuyện không?', 'Bạn gọi điện thoại tới.'],
  ['qr_soc_002', 'N5', 'social', 'ごめんなさい、聞こえませんでした。もう一度お願いできますか？', 'ごめんなさい、きこえませんでした。もういちどおねがいできますか？', 'Xin lỗi tôi nghe không rõ. Bạn nói lại lần nữa được không?', 'Đang nói chuyện nơi ồn ào hoặc sóng điện thoại yếu.'],
  ['qr_soc_003', 'N5', 'social', '日本語すごく上手ですね！', 'にほんごすごくじょうずですね！', 'Tiếng Nhật của bạn giỏi quá!', 'Người Nhật khen tiếng Nhật của bạn (phản xạ khiêm tốn tự nhiên!).'],
  ['qr_soc_004', 'N5', 'social', 'あ、ハンカチ落としましたよ！', 'あ、ハンカチおとしましたよ！', 'Ơ, bạn làm rơi khăn tay kìa!', 'Người đi đường nhặt đồ giúp bạn.'],
  ['qr_soc_005', 'N5', 'social', 'ちょっと待っててね、すぐ戻るから！', 'ちょっとまっててね、すぐもどるから！', 'Đợi mình chút nhé, mình quay lại ngay!', 'Bạn chạy vào nhà vệ sinh / quầy mua nước.'],
  ['qr_soc_006', 'N5', 'social', 'これ、私からのお土産です。よかったらどうぞ！', 'これ、わたしからのおみやげです。よかったらどうぞ！', 'Đây là quà du lịch mình tặng bạn. Cầm lấy nhé!', 'Đồng nghiệp tặng quà sau chuyến đi chơi.'],
  ['qr_soc_007', 'N5', 'social', 'すみません、今何時ですか？', 'すみません、いまなんじですか？', 'Xin lỗi, bây giờ là mấy giờ rồi ạ?', 'Ai đó hỏi giờ bạn.'],
  ['qr_soc_008', 'N5', 'social', 'お邪魔します！わあ、いいお部屋ですね。', 'おじゃまします！わあ、いいおへやですね。', 'Xin phép làm phiền! Ồ, phòng đẹp quá.', 'Bạn vừa bước vào nhà bạn chơi.'],
  ['qr_soc_009', 'N4', 'social', 'あ、傘を電車に忘れちゃったかも！どうしよう！', 'あ、かさをでんしゃにわすれちゃったかも！どうしよう！', 'Ôi, hình như quên ô trên tàu mất rồi! Làm sao giờ!', 'Bạn cuống lên sau khi xuống tàu.'],
  ['qr_soc_010', 'N4', 'social', 'スマホの画面が割れちゃったんだよね…最悪！', 'スマホのがめんがわれちゃったんだよね…さいあく！', 'Màn hình điện thoại bị nứt vỡ mất rồi… xui quá!', 'Bạn than thở chuyện xui xẻo.'],
  ['qr_soc_011', 'N4', 'social', 'やったー！第一志望の会社から内定もらえたよ！', 'やったー！だいいちしぼうのかいしゃからないていもらえたよ！', 'Tuyệt vời! Mình đậu công ty nguyện vọng 1 rồi!', 'Bạn báo tin cực vui!'],
  ['qr_soc_012', 'N4', 'social', 'なんだか最近やる気が出なくて困ってるんだ。', 'なんだかいきんやるきがでなくてこまってるんだ。', 'Chẳng hiểu sao dạo này không có hứng làm gì cả, chán quá.', 'Bạn tâm sự lúc mất năng lượng.'],
  ['qr_soc_013', 'N4', 'social', 'ごめん、返信遅くなっちゃった！バタバタしてて。', 'ごめん、へんしんおそくなっちゃった！バタバタしてて。', 'Xin lỗi trả lời tin nhắn muộn nhé! Mình bận tối mắt.', 'Bạn nhắn tin xin lỗi rep chậm.'],
  ['qr_soc_014', 'N4', 'social', 'さっきから電波が悪いみたいで、声が途切れてるよ。', 'さっきからでんぱがわるいみたいで、こえがとぎれてるよ。', 'Từ nãy sóng yếu hay sao ấy, tiếng cậu cứ bị ngắt quãng.', 'Gọi điện thoại bị rè.'],
  ['qr_soc_015', 'N4', 'social', 'お待たせしました！結構待ちましたか？', 'おまたせしました！けっこうまちましたか？', 'Để bạn đợi lâu rồi! Có phải chờ lâu lắm không?', 'Bạn đến trễ buổi hẹn.'],
  ['qr_soc_016', 'N4', 'social', '本当に助かりました！お礼に今度コーヒーご馳走させてください。', 'ほんとうにたすかりました！おれいにこんどコーヒーごちそうさせてください。', 'Thật sự nhờ bạn giúp nhiều quá! Hôm nào để mình mời cà phê cảm ơn nhé.', 'Đồng nghiệp cảm ơn bạn nhiệt tình.'],
  ['qr_soc_017', 'N3', 'social', 'さっき地震ありましたよね？結構揺れませんでしたか？', 'さっきじしんありましたよね？けっこうゆれませんでしたか？', 'Lúc nãy vừa có động đất đúng không? Rung khá mạnh nhỉ?', 'Vừa trải qua cơn rung chấn nhẹ.'],
  ['qr_soc_018', 'N3', 'social', '財布が見当たらないんだけど、さっきのお店に忘れたかな…', 'さいふがみあたらないんだけど、さっきのおみせにわすれたかな…', 'Không thấy ví đâu cả, không biết có bỏ quên ở quán lúc nãy không…', 'Tình huống khẩn cấp mất đồ.'],
  ['qr_soc_019', 'N3', 'social', '日本とベトナムの文化で、一番違うと感じたことは何ですか？', 'にほんとベトナムのぶんかで、いちばんちがうとかんじたことはなんですか？', 'Giữa văn hóa Nhật và Việt Nam, điều bạn thấy khác biệt nhất là gì?', 'Giao lưu văn hóa.'],
  ['qr_soc_020', 'N3', 'social', 'お言葉に甘えて、遠慮なくいただきます！', 'おことばにあまえて、えんりょなくいただきます！', 'Vậy tôi xin phép không khách sáo nhận nhé!', 'Phản hồi tự nhiên khi ai đó nhiệt tình mời/nhận lời.'],
  ['qr_soc_021', 'N3', 'social', '実は明日すごく大事なプレゼンがあって、今から緊張してるんだ。', 'じつはあしたすごくだいじなプレゼンがあって、いまからきんちょうしてるんだ。', 'Thực ra mai có buổi thuyết trình siêu quan trọng, giờ đã hồi hộp rồi.', 'Động viên bạn trước ngày quan trọng.'],
  ['qr_soc_022', 'N3', 'social', '最近、自分の将来について考えることが増えたんだよね。', 'さいきん、じぶんのしょうらいについてかんがえることがふえたんだよね。', 'Gần đây mình hay suy nghĩ nhiều về tương lai của bản thân.', 'Tâm sự buổi tối với bạn thân.'],
  ['qr_soc_023', 'N3', 'social', 'あれ、もしかして前にどこかで会ったことありませんか？', 'あれ、もしかしてまえにどこかであったことありませんか？', 'Ơ, hình như trước đây tụi mình từng gặp nhau ở đâu rồi phải không?', 'Tình huống bất ngờ ngoài đường / tiệc.'],
  ['qr_soc_024', 'N3', 'social', 'すみません、間違えて別の人にメッセージを送ってしまいました！', 'すみません、まちがえてべつのひとにメッセージをおくってしまいました！', 'Xin lỗi, tôi lỡ gửi nhầm tin nhắn sang bạn mất rồi!', 'Ai đó nhắn nhầm trên LINE/Slack.'],
  ['qr_soc_025', 'N3', 'social', '失敗しちゃって落ち込んでるんだ…どうしたらいいんだろう。', 'しっぱいしちゃっておちこんでるんだ…どうしたらいいんだろう。', 'Mình lỡ làm hỏng việc nên đang buồn quá… biết làm sao đây.', 'An ủi bạn đang buồn.'],
  ['qr_soc_026', 'N3', 'social', 'お忙しいところすみません、今1分だけよろしいでしょうか？', 'おいそがしいところすみません、いまいっぷんだけよろしいでしょうか？', 'Xin lỗi làm phiền lúc bạn bận, cho tôi xin 1 phút được không?', 'Người khác lịch sự gọi bạn.'],
  ['qr_soc_027', 'N2', 'social', '日本人の「本音と建前」って、最初は分かりにくくないですか？', 'にほんじんの「ほんねとたてまえ」って、さいしょはわかりにくくないですか？', 'Kiểu "lời nói xã giao và suy nghĩ thật" của người Nhật lúc đầu có khó hiểu không?', 'Thảo luận văn hóa giao tiếp Nhật.'],
  ['qr_soc_028', 'N2', 'social', '急な予定変更で申し訳ないのですが、別の日程で調整し直してもよろしいですか？', 'きゅうなよていへんこうでもうしわけないのですが、べつのにっていでおちょうせいしなおしてもよろしいですか？', 'Thành thật xin lỗi vì đổi lịch gấp, ta sắp xếp lại ngày khác được không ạ?', 'Đối tác xin đổi lịch hẹn.'],
  ['qr_soc_029', 'N2', 'social', 'お電話ありがとうございます。株式会社ラクの田中と申します。山田様はいらっしゃいますか？', 'おでんわありがとうございます。かぶしきがいしゃラクのたなかともうします。やまださまはいらっしゃいますか？', 'Cảm ơn đã nghe máy. Tôi là Tanaka công ty Raku. Cho hỏi có anh Yamada ở đó không ạ?', 'Thực hành nghe điện thoại công sở Nhật.'],
  ['qr_soc_030', 'N2', 'social', '褒められたとき、謙遜しすぎるのも逆に不自然なのかな？', 'ほめられたとき、けんそんしすぎるのもぎゃくにふしぜんなのかな？', 'Khi được khen, khiêm tốn quá mức liệu có thành thiếu tự nhiên không nhỉ?', 'Hỏi về cách ứng xử lịch thiệp.'],
  ['qr_soc_031', 'N1', 'social', '誤解を与えてしまったようで大変申し訳ありません。真意を説明させていただけますか？', 'ごかいをあたえてしまったようでたいへんもうしわけありません。しんいをせつめいさせていただけますか？', 'Rất xin lỗi vì đã gây hiểu lầm. Cho phép tôi giải thích rõ ý thực sự nhé?', 'Xử lý hiểu lầm trong giao tiếp.'],
  ['qr_soc_032', 'N1', 'social', '異文化の中で暮らすことで、自分自身の考え方にどんな変化がありましたか？', 'いぶんかのなかでくらすことで、じぶんじしんのかんがえかたにどんなへんかがありましたか？', 'Sống trong một nền văn hóa khác đã làm thay đổi suy nghĩ của bạn như thế nào?', 'Trò chuyện sâu về trải nghiệm sống.']
];

export const QUICK_REPLY_BANK: QuickReplyItem[] = RAW_QUICK_REPLIES.map(
  ([id, jlpt, category, questionJp, readingJp, questionVi, contextVi]) => ({
    id,
    jlpt,
    category,
    questionJp,
    readingJp,
    questionVi,
    contextVi
  })
);

export interface QuickReplyProgress {
  total: number;
  passedCount: number;
  retryCount: number;
  unseenCount: number;
  passedIds: Set<string>;
  retryIds: Set<string>;
}

/**
 * Computes mastery progress for Quick Reply prompts based on saved attempt history:
 * - latest score >= 50 -> passed (excluded from future picks to avoid repeats)
 * - latest score < 50  -> retry pool (eligible to appear again)
 */
export function computeQuickReplyProgress(
  history: SentenceAttemptRecord[],
  options: {
    jlpt?: JlptLevel | 'all';
    category?: QuickReplyCategory | 'all';
    ignoredPassedIds?: Set<string>;
  } = {}
): QuickReplyProgress {
  const pool = QUICK_REPLY_BANK.filter((item) => {
    if (options.jlpt && options.jlpt !== 'all' && item.jlpt !== options.jlpt) return false;
    if (options.category && options.category !== 'all' && item.category !== options.category) return false;
    return true;
  });

  // History is sorted newest-first or arbitrary order; pick latest attempt per promptId
  const latestScoreByPrompt = new Map<string, { score: number; createdAt: string }>();
  for (const attempt of history) {
    if (attempt.mode !== 'quick_reply' || !attempt.promptId) continue;
    const prev = latestScoreByPrompt.get(attempt.promptId);
    if (!prev || attempt.createdAt >= prev.createdAt) {
      latestScoreByPrompt.set(attempt.promptId, {
        score: attempt.feedback.overallScore,
        createdAt: attempt.createdAt
      });
    }
  }

  const passedIds = new Set<string>();
  const retryIds = new Set<string>();

  for (const item of pool) {
    if (options.ignoredPassedIds?.has(item.id)) continue;
    const latest = latestScoreByPrompt.get(item.id);
    if (!latest) continue;
    if (latest.score >= QUICK_REPLY_PASS_SCORE) {
      passedIds.add(item.id);
    } else {
      retryIds.add(item.id);
    }
  }

  return {
    total: pool.length,
    passedCount: passedIds.size,
    retryCount: retryIds.size,
    unseenCount: Math.max(0, pool.length - passedIds.size - retryIds.size),
    passedIds,
    retryIds
  };
}

export interface PickQuickReplyResult {
  item: QuickReplyItem;
  allPassed: boolean;
  isRetry: boolean;
  progress: QuickReplyProgress;
}

/**
 * Picks the next Quick Reply prompt while avoiding any prompt with score >= 50.
 * Prompts with score < 50 remain eligible and are interleaved back for retry.
 */
export function pickNextQuickReplyItem(options: {
  jlpt?: JlptLevel | 'all';
  category?: QuickReplyCategory | 'all';
  history?: SentenceAttemptRecord[];
  currentPromptId?: string;
  ignoredPassedIds?: Set<string>;
} = {}): PickQuickReplyResult {
  const history = options.history || [];
  const pool = QUICK_REPLY_BANK.filter((item) => {
    if (options.jlpt && options.jlpt !== 'all' && item.jlpt !== options.jlpt) return false;
    if (options.category && options.category !== 'all' && item.category !== options.category) return false;
    return true;
  });

  const effectivePool = pool.length > 0 ? pool : QUICK_REPLY_BANK;
  const progress = computeQuickReplyProgress(history, {
    jlpt: pool.length > 0 ? options.jlpt : 'all',
    category: pool.length > 0 ? options.category : 'all',
    ignoredPassedIds: options.ignoredPassedIds
  });

  const unseen = effectivePool.filter(
    (item) => !progress.passedIds.has(item.id) && !progress.retryIds.has(item.id)
  );
  const retries = effectivePool.filter((item) => progress.retryIds.has(item.id));

  const excludeCurrent = (items: QuickReplyItem[]) => {
    if (items.length <= 1 || !options.currentPromptId) return items;
    return items.filter((item) => item.id !== options.currentPromptId);
  };

  // All prompts in this filter reached >= 50 -> allow review cycle & flag allPassed
  if (unseen.length === 0 && retries.length === 0) {
    const candidates = excludeCurrent(effectivePool);
    const picked = candidates[Math.floor(Math.random() * candidates.length)]!;
    return { item: picked, allPassed: true, isRetry: false, progress };
  }

  // Interleave retries (< 50) gently (35% chance when both unseen and retry exist)
  const retryCandidates = excludeCurrent(retries);
  const unseenCandidates = excludeCurrent(unseen);

  if (retryCandidates.length > 0 && (unseenCandidates.length === 0 || Math.random() < 0.35)) {
    const picked = retryCandidates[Math.floor(Math.random() * retryCandidates.length)]!;
    return { item: picked, allPassed: false, isRetry: true, progress };
  }

  const finalPool = unseenCandidates.length > 0 ? unseenCandidates : retryCandidates;
  const picked = finalPool[Math.floor(Math.random() * finalPool.length)]!;
  return {
    item: picked,
    allPassed: false,
    isRetry: progress.retryIds.has(picked.id),
    progress
  };
}
