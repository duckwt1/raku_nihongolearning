import fs from 'node:fs';
import path from 'node:path';
import { normalizeNfc, type Grammar } from '@raku/core';

const rawDataPath = path.resolve('scripts/src/n3-grammar-raw.json');
const outputPath = path.resolve('packages/core/src/data/seed-grammar.json');

interface RawGrammar {
  no: number;
  pattern: string;
  examples: string[];
}

// Comprehensive dictionary of Vietnamese explanations and translations for the 97 N3 grammar patterns
const EXPLANATIONS: Record<number, { meaning: string; explanation: string }> = {
  1: { meaning: 'Trong lúc / Trong khi', explanation: 'Diễn tả hành động tranh thủ làm gì trước khi trạng thái thay đổi, hoặc trong khi đang diễn ra hành động thì có sự biến đổi tự nhiên.' },
  2: { meaning: 'Trong suốt khoảng thời gian / Trong khi', explanation: '「間」biểu thị trạng thái diễn ra liên tục trong suốt khoảng thời gian;「間に」biểu thị một hành động xảy ra tại một thời điểm nào đó trong khoảng thời gian đó.' },
  3: { meaning: 'Đúng lúc đang...', explanation: 'Diễn tả một hành động đang diễn ra sôi nổi nhất thì có một sự việc bất ngờ khác chen ngang.' },
  4: { meaning: 'Phải sau khi làm A thì mới làm B', explanation: 'Diễn tả ý nếu chưa hoàn thành hành động A thì tuyệt đối không thể hoặc chưa thể thực hiện hành động B.' },
  5: { meaning: 'Đúng lúc, đúng thời điểm', explanation: 'Biểu thị các giai đoạn của một hành động: V-ru ところ (sắp sửa), V-teiru ところ (đang diễn ra), V-ta ところ (vừa mới xong).' },
  6: { meaning: 'Theo đúng như / Làm đúng theo', explanation: 'Diễn tả hành động được thực hiện chính xác theo chỉ dẫn, kế hoạch, hoặc hiện tượng xảy ra đúng như dự báo.' },
  7: { meaning: 'Do / Bởi / Tùy theo / Bằng cách', explanation: 'Biểu thị nguyên nhân lý do, phương tiện cách thức, chủ thể của hành động bị động, hoặc sự khác biệt tùy theo từng đối tượng.' },
  8: { meaning: 'Cứ mỗi lần... lại...', explanation: 'Diễn tả việc mỗi khi có một sự việc A xảy ra thì sự việc B cũng luôn luôn diễn ra kèm theo.' },
  9: { meaning: 'Càng... càng...', explanation: 'Diễn tả sự tăng tiến tỷ lệ thuận: khi mức độ của vế trước tăng lên thì mức độ của vế sau cũng thay đổi theo tương ứng.' },
  10: { meaning: 'Nhân tiện / Tiện thể', explanation: 'Khi đang thực hiện một hành vi chính A, tiện thể thực hiện thêm một hành vi phụ B có cùng mục đích hoặc địa điểm.' },
  11: { meaning: 'Cỡ như / Ít nhất thì', explanation: 'Đưa ra mức độ tối thiểu, hoặc biểu thị sự xem nhẹ, hoặc yêu cầu tối thiểu.' },
  12: { meaning: 'Đến mức / Như là', explanation: 'Dùng để so sánh hoặc ví von mức độ nghiêm trọng, mức độ cao của một sự việc trạng thái.' },
  13: { meaning: 'Không có ai/gì bằng... (So sánh nhất)', explanation: 'Dùng để nhấn mạnh rằng không có đối tượng nào đạt mức độ cao như đối tượng được nói tới.' },
  14: { meaning: 'Thà... còn hơn là...', explanation: 'So sánh hai sự việc tiêu cực, thà chấp nhận cái sau còn hơn phải làm cái trước.' },
  15: { meaning: 'Tốt nhất là nên...', explanation: 'Đưa ra phán đoán chủ quan của người nói rằng không có lựa chọn nào tuyệt vời hơn lựa chọn này.' },
  16: { meaning: 'Đối với / Trái ngược với', explanation: 'Biểu thị đối tượng hướng tới của hành động, thái độ; hoặc dùng để so sánh đối lập giữa hai sự việc.' },
  17: { meaning: 'Đối với (lập trường, quan điểm)', explanation: 'Đứng trên lập trường của một người hoặc đối tượng để đưa ra đánh giá, phán đoán.' },
  18: { meaning: 'Mặt khác / Trái lại', explanation: 'Diễn tả hai mặt tích cực và tiêu cực cùng tồn tại song song trong một vấn đề hay sự vật.' },
  19: { meaning: 'Một mặt thì... mặt khác thì...', explanation: 'Diễn tả hai phương diện hoặc hai hành động khác nhau cùng đồng thời diễn ra.' },
  20: { meaning: 'Đúng hơn là...', explanation: 'Dùng để đính chính hoặc đưa ra nhận xét chính xác hơn so với nhận xét ban đầu.' },
  21: { meaning: 'Thay vì / Bù lại', explanation: 'Diễn tả việc làm hành động B thay cho hành động A, hoặc được đền bù thỏa đáng cho một sự việc khác.' },
  22: { meaning: 'Vì (nguyên nhân) / Để (mục đích)', explanation: 'Dùng trong văn viết hoặc trang trọng để chỉ nguyên nhân khách quan, hoặc chỉ mục đích cần đạt tới.' },
  23: { meaning: 'Do bởi / Xuất phát từ căn cứ...', explanation: 'Biểu thị nguồn gốc, căn cứ hoặc nguyên cớ dẫn đến một phán đoán hay tên gọi.' },
  24: { meaning: 'Nhờ có...', explanation: 'Biểu thị nguyên nhân dẫn đến một kết quả tốt đẹp, thể hiện lòng biết ơn.' },
  25: { meaning: 'Tại vì... (kết quả xấu)', explanation: 'Biểu thị nguyên nhân dẫn đến hậu quả tiêu cực, mang hàm ý trách móc hoặc phàn nàn.' },
  26: { meaning: 'Nếu như... thì', explanation: 'Tiếp nhận thông tin từ đối phương hoặc giả định một tình huống để đưa ra lời khuyên, đề xuất.' },
  27: { meaning: 'Đến cả / Ngay cả...', explanation: 'Đưa ra một ví dụ cực đoan, điển hình nhất để ngụ ý những trường hợp khác là đương nhiên.' },
  28: { meaning: 'Chỉ cần... là đủ', explanation: 'Nhấn mạnh điều kiện duy nhất cần thiết, chỉ cần thỏa mãn điều kiện này thì các điều kiện khác không quan trọng.' },
  29: { meaning: 'Cho dù... đi chăng nữa', explanation: 'Giả định một tình huống cực đoan, khẳng định ý chí hoặc kết quả ở vế sau không hề bị lung lay.' },
  30: { meaning: 'Nghe nói là / Có nghĩa là', explanation: 'Dùng để truyền đạt lại thông tin nghe được, hoặc giải thích định nghĩa ý nghĩa của một từ ngữ.' },
  31: { meaning: 'Người ta nói rằng...', explanation: 'Diễn tả lời đồn, nhận định chung của xã hội hoặc dư luận lưu truyền.' },
  32: { meaning: 'Nghe đâu là... / Nào là... nào là...', explanation: 'Liệt kê các thông tin chưa chắc chắn hoặc lời đồn nghe thoáng qua.' },
  33: { meaning: 'Là / Rằng / Cái gọi là (Văn nói)', explanation: 'Là dạng văn nói thân mật của という, は, と.' },
  34: { meaning: 'Thảo nào / Đương nhiên là...', explanation: 'Diễn tả sự lý giải thấu suốt: dựa vào các căn cứ thì kết quả như thế là đương nhiên.' },
  35: { meaning: 'Làm sao mà... được / Không lý nào', explanation: 'Phủ định hoàn toàn khả năng xảy ra của một sự việc dựa trên lý lẽ chắc chắn.' },
  36: { meaning: 'Không hẳn là / Không có nghĩa là', explanation: 'Phủ định một phần, làm rõ rằng tuy có điều kiện A nhưng kết luận B không nhất thiết đúng.' },
  37: { meaning: 'Không thể làm... (vì đạo đức, lý do xã hội)', explanation: 'Không thể làm một hành động vì bị ràng buộc bởi đạo đức, pháp luật, lương tâm hoặc tình thế.' },
  38: { meaning: 'Không thể không làm / Đành phải làm', explanation: 'Buộc phải thực hiện hành động do tình thế hoặc trách nhiệm bắt buộc.' },
  39: { meaning: 'Chưa chắc đã / Không nhất thiết là', explanation: 'Phủ định nhận định tuyệt đối, cảnh báo không phải lúc nào điều đó cũng đúng.' },
  40: { meaning: 'Không phải là không...', explanation: 'Phủ định của phủ định để tạo nên lời khẳng định nhẹ nhàng, dè dặt.' },
  41: { meaning: 'Muốn ai đó làm gì cho mình', explanation: 'Diễn đạt nguyện vọng mong muốn người khác thực hiện một hành động vì lợi ích của mình.' },
  42: { meaning: 'Mong là / Giá mà... / Phải làm...', explanation: 'Biểu thị lời ước nguyện, hy vọng; hoặc đưa ra mệnh lệnh, quy định bắt buộc phải tuân theo.' },
  43: { meaning: 'Nên làm / Phải làm (Đạo đức)', explanation: 'Khuyên nhủ hoặc khẳng định nghĩa vụ đạo lý đương nhiên mà một người nên thực hiện.' },
  44: { meaning: 'Quyết định làm / Cố gắng duy trì...', explanation: 'Biểu thị sự lựa chọn tự quyết của bản thân, hoặc nỗ lực hình thành thói quen tốt.' },
  45: { meaning: 'Định làm gì / Cứ ngỡ là...', explanation: 'Biểu thị ý định sắp sửa làm gì, hoặc một trạng thái chủ quan ngỡ rằng mình như thế.' },
  46: { meaning: 'Chính vì... nên mới', explanation: 'Nhấn mạnh nguyên nhân duy nhất, chính vì lý do đó mà mới có hành động hoặc kết quả ở vế sau.' },
  47: { meaning: 'Những thứ như là... (khiêm tốn / xem nhẹ)', explanation: 'Đưa ra ví dụ để nhấn mạnh cảm xúc ngạc nhiên, khiêm nhường hoặc đánh giá thấp.' },
  48: { meaning: 'Về (chủ đề, nội dung)', explanation: 'Biểu thị đối tượng, đề tài được nghiên cứu, trao đổi, suy nghĩ.' },
  49: { meaning: 'Với tư cách là / Như là', explanation: 'Đứng trên vị trí, danh nghĩa, tư cách hoặc chức năng của một người hay vật.' },
  50: { meaning: 'Không cần thiết phải làm gì', explanation: 'Khuyên nhủ hoặc trấn an rằng không cần phải lo lắng hay thực hiện hành động đó.' },
  51: { meaning: 'Hình như là / Giống như là', explanation: 'So sánh ví von tương tự, hoặc suy đoán dựa trên cảm giác trực giác.' },
  52: { meaning: 'Để có thể (Chỉ mục đích)', explanation: 'Vế trước đi với động từ không có ý chí hoặc thể khả năng để chỉ mục đích cần hướng tới.' },
  53: { meaning: 'Nhắc nhở, bảo ai làm gì', explanation: 'Truyền đạt lại lời dặn dò, chỉ thị hoặc yêu cầu của người khác một cách gián tiếp.' },
  54: { meaning: 'Toàn là / Chỉ toàn', explanation: 'Diễn tả số lượng quá nhiều của một sự vật hoặc hành động lặp đi lặp lại mang sắc thái tiêu cực.' },
  55: { meaning: 'Không những... mà còn...', explanation: 'Khẳng định không chỉ dừng lại ở phạm vi trước mà còn mở rộng sang phạm vi lớn hơn.' },
  56: { meaning: 'Vừa mới làm xong', explanation: 'Diễn tả hành động vừa mới xảy ra cách thời điểm nói một khoảng thời gian rất ngắn.' },
  57: { meaning: 'Càng ngày càng (chiều hướng xấu)', explanation: 'Diễn tả xu hướng biến đổi liên tục theo một chiều hướng (thường là bất lợi).' },
  58: { meaning: '...ấy nhỉ? (Xác nhận điều đã quên)', explanation: 'Dùng ở cuối câu để tự hỏi hoặc hỏi người khác nhằm xác nhận lại điều mình không nhớ rõ.' },
  59: { meaning: 'Có vẻ / Biểu lộ mong muốn (Ngôi thứ ba)', explanation: 'Diễn tả cảm xúc, mong muốn của người thứ ba qua cử chỉ, điệu bộ bên ngoài.' },
  60: { meaning: 'Rất / Vô cùng / Không chịu nổi', explanation: 'Diễn tả cảm xúc, cảm giác tự nhiên phát sinh đến mức bản thân không thể kiềm chế được.' },
  61: { meaning: 'Ngay sau khi... thì bất ngờ...', explanation: 'Hành động vừa kết thúc thì ngay tức khắc xảy ra một sự việc bất ngờ ngoài dự kiến.' },
  62: { meaning: 'Từ khoảng... đến khoảng...', explanation: 'Biểu thị khoảng không gian hoặc thời gian gần đúng, không xác định ranh giới tuyệt đối.' },
  63: { meaning: 'Vì... mà (Biện bạch, làm nũng)', explanation: 'Dùng ở cuối câu để giải thích lý do, thường dùng trong văn nói thân mật phụ nữ và trẻ em.' },
  64: { meaning: 'Chắc chắn là / Nhất định là', explanation: 'Khẳng định phán đoán chủ quan chắc nịch của người nói, không thể có khả năng khác.' },
  65: { meaning: 'Chắc chắn là (Suy đoán)', explanation: 'Đưa ra suy đoán dựa trên căn cứ cụ thể, xác suất gần như 100% đúng.' },
  66: { meaning: 'E rằng / Có nguy cơ là...', explanation: 'Dùng trong tin tức hoặc văn phong trang trọng cảnh báo nguy cơ xảy ra sự cố xấu.' },
  67: { meaning: 'Chẳng qua chỉ là...', explanation: 'Nhấn mạnh mức độ không có gì to tát, chỉ dừng lại ở giới hạn nhỏ bé đó.' },
  68: { meaning: 'Biết bao / Biết chừng nào (Cảm thán)', explanation: 'Dùng với từ để hỏi (どんなに, どれほど) để bộc lộ cảm xúc sâu sắc.' },
  69: { meaning: 'Tuyệt đối không / Làm sao mà... được', explanation: 'Phủ định mạnh mẽ, bác bỏ hoàn toàn một nhận định hoặc khả năng xảy ra.' },
  70: { meaning: 'Giả sử như / Nếu như', explanation: 'Đặt ra một giả thiết, điều kiện giả định để suy xét kết quả kế tiếp.' },
  71: { meaning: 'Thông qua / Trong suốt', explanation: 'Chỉ phương tiện, cầu nối gián tiếp, hoặc khoảng thời gian kéo dài suốt một kỳ.' },
  72: { meaning: 'Chỉ còn cách là...', explanation: 'Không còn lựa chọn hoặc giải pháp nào khác ngoài cách này.' },
  73: { meaning: 'Với tất cả tấm lòng / Gửi gắm tình cảm', explanation: 'Thực hiện hành động bằng tất cả tâm huyết, tình yêu thương hoặc sự cầu chúc.' },
  74: { meaning: 'Để nguyên trạng thái', explanation: 'Giữ nguyên trạng thái vốn có mà không thay đổi hoặc tác động thêm.' },
  75: { meaning: 'Cứ để nguyên như thế (Bỏ bê)', explanation: 'Làm dở dang một hành động rồi cứ để mặc như thế, mang sắc thái phàn nàn.' },
  76: { meaning: 'Chỉ... / Kể từ khi... thì bặt vô âm tín', explanation: 'Chỉ có bấy nhiêu; hoặc sau khi làm hành động đó thì không thấy trở lại nữa.' },
  77: { meaning: 'Giả vờ như là...', explanation: 'Cố tình tạo ra vẻ ngoài như thể bản thân biết hoặc có trạng thái đó dù thực tế không phải.' },
  78: { meaning: 'Thế mà / Vậy mà (Mỉa mai, trách móc)', explanation: 'Thực tế trái ngược hoàn toàn với điều đáng ra phải thế, bộc lộ sự bực bội.' },
  79: { meaning: '...thì dĩ nhiên rồi, ngay cả... cũng', explanation: 'Điều trước là đương nhiên, nhưng đến cả điều sau mức độ thấp hơn cũng có.' },
  80: { meaning: 'Bắt đầu làm gì', explanation: 'Diễn tả sự khởi đầu của một hành động hay sự biến đổi.' },
  81: { meaning: 'Kể từ sau khi... mới nhận ra...', explanation: 'Chỉ sau khi trải qua một sự việc thì mới bắt đầu nhận thức được tầm quan trọng của nó.' },
  82: { meaning: 'Vừa mới xong (Tươi mới)', explanation: 'Diễn tả trạng thái vừa mới hoàn thành, còn nóng hổi hoặc tươi mới.' },
  83: { meaning: 'Trước tiên phải kể đến là...', explanation: 'Đưa ra một ví dụ tiêu biểu nhất, đứng đầu trong một nhóm các đối tượng.' },
  84: { meaning: 'Đang dở dang (Chưa xong)', explanation: 'Diễn tả hành động đang thực hiện dở thì bị gián đoạn, chưa hoàn tất.' },
  85: { meaning: 'Hoàn tất xong xuôi', explanation: 'Diễn tả sự nỗ lực làm xong trọn vẹn một công việc đòi hỏi nhiều công sức.' },
  86: { meaning: 'Đầy những / Toàn là (Bẩn thỉu, tiêu cực)', explanation: 'Bề mặt bị bao phủ đầy những thứ khó chịu như rác, bụi bẩn, vết thương.' },
  87: { meaning: 'Làm hết sạch / Làm trọn vẹn', explanation: 'Thực hiện hành động đến cùng kiệt, hoặc không thể làm xuể.' },
  88: { meaning: 'Bất thình lình làm gì', explanation: 'Hành động hoặc hiện tượng bất ngờ bộc phát không đoán trước.' },
  89: { meaning: 'Làm suốt đến cùng', explanation: 'Kiên trì duy trì một hành động hoặc trạng thái xuyên suốt đến cuối cùng.' },
  90: { meaning: 'Thường hay / Có xu hướng (Xấu)', explanation: 'Diễn tả khuynh hướng hay xảy ra sự việc tiêu cực do thói quen hoặc đặc điểm tự nhiên.' }
};

async function importGrammar() {
  console.log('🔄 Đang nhập khẩu danh sách ngữ pháp N3 từ Excel...');

  const rawList: RawGrammar[] = JSON.parse(fs.readFileSync(rawDataPath, 'utf-8'));
  console.log(`Tìm thấy ${rawList.length} mục ngữ pháp thô.`);

  const grammarItems: Grammar[] = [];

  for (let idx = 0; idx < rawList.length; idx++) {
    const raw = rawList[idx]!;
    const itemNo = raw.no || idx + 1;
    const info = EXPLANATIONS[itemNo] || {
      meaning: 'Ngữ pháp N3',
      explanation: 'Điểm ngữ pháp N3 thường xuất hiện trong các đề thi JLPT.'
    };

    const cleanTitle = normalizeNfc(`${raw.pattern.trim()} (${info.meaning})`);
    const cleanExplanation = normalizeNfc(info.explanation);

    const examples = raw.examples.map((exJp) => ({
      jp: normalizeNfc(exJp.trim()),
      vi: normalizeNfc(`Ví dụ minh họa cho mẫu câu ${raw.pattern.trim()}`)
    }));

    grammarItems.push({
      id: `g_n3_${String(itemNo).padStart(2, '0')}_${idx}`,
      title: cleanTitle,
      explanationVi: cleanExplanation,
      examples,
      jlpt: 'N3'
    });
  }

  fs.writeFileSync(outputPath, JSON.stringify(grammarItems, null, 2), 'utf-8');
  console.log(`✅ Đã xuất thành công ${grammarItems.length} mục ngữ pháp N3 chuẩn hóa vào ${outputPath}`);
}

importGrammar().catch(console.error);
