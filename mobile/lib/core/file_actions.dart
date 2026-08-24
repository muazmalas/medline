import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'api_client.dart';
import 'mobile_ui.dart';

Future<void> downloadAndShare(
  BuildContext context,
  ApiClient api, {
  required String path,
  required String fileName,
  String? subject,
}) async {
  try {
    final response = await api.download(path);
    final directory = await getTemporaryDirectory();
    final safeName = fileName.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '-');
    final file = File('${directory.path}${Platform.pathSeparator}$safeName');
    await file.writeAsBytes(response.bodyBytes, flush: true);
    if (!context.mounted) return;
    final box = context.findRenderObject() as RenderBox?;
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, name: safeName)],
        subject: subject,
        title: subject,
        sharePositionOrigin:
            box == null ? null : box.localToGlobal(Offset.zero) & box.size,
      ),
    );
  } catch (exception) {
    if (context.mounted) {
      showMessage(context, exception.toString(), error: true);
    }
  }
}
