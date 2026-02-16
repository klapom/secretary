package ai.secretary.android.ui

import androidx.compose.runtime.Composable
import ai.secretary.android.MainViewModel
import ai.secretary.android.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
