import { encodeQueryDirectoryRequest, decodeQueryDirectoryResponse, parseFileIdBothDirectoryInformation, QueryDirectoryFlag, } from "../wire/structs/queryDirectory.js";
import { FileInformationClass } from "../wire/structs/queryInfo.js";
import { SmbCommand, NTStatus, isSuccess, statusName } from "../wire/commands.js";
import { SmbError } from "../errors.js";
export async function readdirAll(open, pattern = "*") {
    const items = [];
    let first = true;
    // Continuation FileName strategy. The canonical SMB2 continuation sends an
    // EMPTY FileName (macOS and Windows accept this). Samba — including Synology
    // DSM — rejects an empty continuation FileName with STATUS_OBJECT_NAME_INVALID.
    // So we default to the canonical empty pattern and, on that specific reject,
    // switch to resending the search pattern and retry the page. The reject is a
    // parameter-validation error returned before the server advances the
    // enumeration cursor, so the retry doesn't skip entries. The switch is sticky
    // for the rest of the listing, so each server self-selects its accepted form.
    let resendPatternOnContinuation = false;
    for (;;) {
        const isFirst = first;
        const searchPattern = isFirst
            ? pattern
            : resendPatternOnContinuation
                ? pattern
                : "";
        const body = encodeQueryDirectoryRequest({
            fileInformationClass: FileInformationClass.FileIdBothDirectoryInformation,
            flags: isFirst ? QueryDirectoryFlag.RESTART_SCANS : 0,
            fileIndex: 0,
            fileId: open.fileId,
            searchPattern,
            outputBufferLength: 65536,
        });
        first = false;
        const signing = open.tree.session.makeSigning();
        const resp = await open.tree.conn.send(SmbCommand.QUERY_DIRECTORY, body, {
            sessionId: open.tree.session.sessionId,
            treeId: open.tree.treeId,
            ...(signing !== undefined ? { signing } : {}),
            encrypt: open.tree.encryptRequired,
            creditCharge: 1,
        });
        // A continuation with an empty FileName was rejected (Samba/Synology DSM):
        // switch to resending the pattern and retry this page (the cursor has not
        // advanced). Attempted once, then sticky for the rest of the listing.
        if (!isFirst && !resendPatternOnContinuation && resp.header.status === NTStatus.STATUS_OBJECT_NAME_INVALID) {
            resendPatternOnContinuation = true;
            continue;
        }
        if (resp.header.status === NTStatus.STATUS_NO_MORE_FILES)
            break;
        if (!isSuccess(resp.header.status)) {
            throw new SmbError({ status: resp.header.status, message: `QUERY_DIRECTORY failed: ${statusName(resp.header.status)}` });
        }
        const buf = decodeQueryDirectoryResponse(resp.body, 64);
        if (buf.length === 0)
            break;
        const page = parseFileIdBothDirectoryInformation(buf);
        for (const e of page)
            items.push(e);
        if (page.length === 0)
            break;
    }
    // Filter "." and ".."
    return items.filter((x) => x.fileName !== "." && x.fileName !== "..");
}
