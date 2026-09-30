import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExportPanel from "./ExportPanel";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe("ExportPanel filename selection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the chosen filename when downloading a completed export", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ jobId: "job_456", message: "Preparing export" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "succeeded",
          progressPercent: 100,
          message: "Export complete",
          downloadUrl: "https://example.test/finished.mp3",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const submittedFields: { current: FormData | null } = { current: null };
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (this: HTMLFormElement) {
      submittedFields.current = new FormData(this);
    });

    render(
      <ExportPanel
        duration={45}
        sourceFilename="recording.wav"
        projectId="project_123"
        sessionId="session_456"
        sourceBlobKey="audio/source/project_123/recording.wav"
        sourceRevision={1}
        operations={[]}
        onClose={vi.fn()}
      />,
    );

    const filenameInput = screen.getByLabelText("File name");
    expect((filenameInput as HTMLInputElement).value).toBe("recording");
    expect(document.querySelector(".export-filename-control span")?.textContent).toBe(".mp3");

    fireEvent.click(screen.getByRole("button", { name: "Start export as MP3" }));
    const downloadButton = await screen.findByRole("button", { name: /Download\s+MP3/ });
    fireEvent.change(filenameInput, { target: { value: "My Final Mix" } });
    fireEvent.click(downloadButton);

    expect(submittedFields.current?.get("jobId")).toBe("job_456");
    expect(submittedFields.current?.get("sessionId")).toBe("session_456");
    expect(submittedFields.current?.get("filename")).toBe("My Final Mix");
  });
});