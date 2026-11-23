import 'package:flutter_test/flutter_test.dart';
import 'package:maya_assistant/services/temp_files.dart';

void main() {
  test('creates files inside the session dir and deletes them on clear', () async {
    final temp = await SessionTempFiles.instance();
    final file = await temp.createFile('shot.png', [1, 2, 3]);
    expect(await file.exists(), isTrue);

    await temp.clear();
    expect(await file.exists(), isFalse, reason: 'الملفات المؤقتة تُحذف فور انتهاء الاستخدام');
    expect(await temp.directory.exists(), isFalse);
  });

  test('clear is idempotent and never throws', () async {
    final temp = await SessionTempFiles.instance();
    await temp.clear();
    await temp.clear();
    expect(await temp.directory.exists(), isFalse);
  });
}
