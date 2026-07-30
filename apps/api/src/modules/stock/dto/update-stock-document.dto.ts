import { CreateStockDocumentDto } from './create-stock-document.dto';

// A draft is replaced as one validated unit so it can never contain a mix of old and new rows.
export class UpdateStockDocumentDto extends CreateStockDocumentDto {}
