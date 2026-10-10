import { VSCodeSelectionService } from "../../../../../../src/adapters/primary/vscode/services/selectionService";
import { NotificationPort } from "../../../../../../src/application/ports/driven/NotificationPort";
import { SelectionChangeListener } from "../../../../../../src/application/ports/driven/SelectionPort";

describe("VSCodeSelectionService deleted files", () => {
  let service: VSCodeSelectionService;
  let listener: jest.Mocked<SelectionChangeListener>;

  beforeEach(() => {
    const notificationService: jest.Mocked<NotificationPort> = {
      showError: jest.fn(),
      showInformation: jest.fn(),
      showWarning: jest.fn(),
      showFolderSelectDialog: jest.fn(),
    };
    service = new VSCodeSelectionService(notificationService);
    listener = { onSelectionChanged: jest.fn() };
    service.registerWebviewProvider(listener);
  });

  test("stores deleted files and notifies only on changes", () => {
    service.setDeletedFiles(["old.ts"]);
    service.setDeletedFiles(["old.ts"]);

    expect(service.getDeletedFiles()).toEqual(["old.ts"]);
    expect(listener.onSelectionChanged).toHaveBeenCalledTimes(1);
  });

  test("clearSelection also clears deleted files", () => {
    service.setDeletedFiles(["old.ts"]);
    listener.onSelectionChanged.mockClear();

    service.clearSelection();

    expect(service.getDeletedFiles()).toEqual([]);
    expect(listener.onSelectionChanged).toHaveBeenCalledWith([]);
  });
});
