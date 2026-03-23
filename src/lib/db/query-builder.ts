/**
 * Supabase 호환 쿼리 빌더 (Cloud SQL pg 기반)
 *
 * 기존 코드의 supabase.from('table').select().eq().single() 패턴을
 * 그대로 유지하면서 Cloud SQL로 쿼리를 실행한다.
 *
 * 지원 메서드:
 * - select, insert, update, delete, upsert
 * - eq, neq, gt, gte, lt, lte, in, is, ilike, like, not, or
 * - order, limit, range, single, maybeSingle
 * - { count: "exact" }, { head: true }
 */
import type { Pool } from "pg";

// ─── 타입 ───

interface SelectOptions {
  count?: "exact" | "planned" | "estimated";
  head?: boolean;
}

interface UpsertOptions {
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

interface OrderOptions {
  ascending?: boolean;
  nullsFirst?: boolean;
}

interface Filter {
  type: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is" | "ilike" | "like" | "not" | "or" | "contains" | "overlaps" | "match" | "textSearch";
  column?: string;
  value?: unknown;
  // for .not()
  operator?: string;
  // for .or()
  orString?: string;
}

interface OrderClause {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

interface EmbeddedRelation {
  alias: string;
  targetTable: string;
  sourceColumn: string;
  targetColumns: string[];
  isArray: boolean;
}

interface QueryResult<T = Record<string, unknown>> {
  data: T | T[] | null;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

// ─── 쿼리 빌더 ───

export class PostgresQueryBuilder<T = Record<string, unknown>> {
  private pool: Pool;
  private _table: string;
  private _operation: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private _selectColumns = "*";
  private _filters: Filter[] = [];
  private _orders: OrderClause[] = [];
  private _limitVal: number | null = null;
  private _offsetVal: number | null = null;
  private _single = false;
  private _maybeSingle = false;
  private _count: "exact" | null = null;
  private _head = false;
  private _data: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private _onConflict: string | null = null;
  private _returning = false;
  private _embeddedRelations: EmbeddedRelation[] = [];
  private _baseColumns: string[] = [];

  constructor(pool: Pool, table: string) {
    this.pool = pool;
    this._table = table;
  }

  // ─── 작업 ───

  select(columns?: string, options?: SelectOptions): this {
    this._operation = "select";
    if (columns) {
      this._parseSelectColumns(columns);
    } else {
      this._selectColumns = "*";
    }
    if (options?.count) this._count = options.count as "exact";
    if (options?.head) this._head = true;
    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]): this {
    this._operation = "insert";
    this._data = data;
    return this;
  }

  update(data: Record<string, unknown>): this {
    this._operation = "update";
    this._data = data;
    return this;
  }

  delete(): this {
    this._operation = "delete";
    return this;
  }

  upsert(data: Record<string, unknown> | Record<string, unknown>[], options?: UpsertOptions): this {
    this._operation = "upsert";
    this._data = data;
    if (options?.onConflict) this._onConflict = options.onConflict;
    return this;
  }

  // ─── 필터 ───

  eq(column: string, value: unknown): this {
    this._filters.push({ type: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this._filters.push({ type: "neq", column, value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this._filters.push({ type: "gt", column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this._filters.push({ type: "gte", column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this._filters.push({ type: "lt", column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this._filters.push({ type: "lte", column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this._filters.push({ type: "in", column, value: values });
    return this;
  }

  is(column: string, value: unknown): this {
    this._filters.push({ type: "is", column, value });
    return this;
  }

  ilike(column: string, value: string): this {
    this._filters.push({ type: "ilike", column, value });
    return this;
  }

  like(column: string, value: string): this {
    this._filters.push({ type: "like", column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    this._filters.push({ type: "not", column, operator, value });
    return this;
  }

  or(filterString: string): this {
    this._filters.push({ type: "or", orString: filterString });
    return this;
  }

  contains(column: string, value: unknown): this {
    this._filters.push({ type: "contains", column, value });
    return this;
  }

  overlaps(column: string, value: unknown): this {
    this._filters.push({ type: "overlaps", column, value });
    return this;
  }

  match(query: Record<string, unknown>): this {
    for (const [col, val] of Object.entries(query)) {
      this._filters.push({ type: "eq", column: col, value: val });
    }
    return this;
  }

  textSearch(column: string, query: string): this {
    this._filters.push({ type: "textSearch", column, value: query });
    return this;
  }

  // ─── 정렬/페이지네이션 ───

  order(column: string, options?: OrderOptions): this {
    this._orders.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst,
    });
    return this;
  }

  limit(n: number): this {
    this._limitVal = n;
    return this;
  }

  range(from: number, to: number): this {
    this._offsetVal = from;
    this._limitVal = to - from + 1;
    return this;
  }

  single(): this {
    this._single = true;
    this._limitVal = 1;
    return this;
  }

  maybeSingle(): this {
    this._maybeSingle = true;
    this._limitVal = 1;
    return this;
  }

  // ─── select() 호출 후 INSERT/UPDATE/UPSERT 결과에 RETURNING 추가 ───
  // supabase 패턴: .insert({...}).select() → RETURNING *
  // 이미 select 호출이면 select 유지, 아니면 returning 활성화
  // 주의: 이 메서드가 select 다음에 호출될 수도 있으므로 operation 체크

  // select가 insert/update/delete 뒤에 체이닝되는 경우 처리
  // 예: .insert({...}).select("id")
  private _applyReturning(columns?: string): void {
    this._returning = true;
    if (columns && columns !== "*") {
      this._selectColumns = columns;
    }
  }

  // ─── Thenable (await 지원) ───

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    resolve?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this._execute().then(resolve, reject);
  }

  // ─── 내부 빌드/실행 ───

  private async _execute(): Promise<QueryResult<T>> {
    try {
      switch (this._operation) {
        case "select":
          return await this._executeSelect();
        case "insert":
          return await this._executeInsert();
        case "update":
          return await this._executeUpdate();
        case "delete":
          return await this._executeDelete();
        case "upsert":
          return await this._executeUpsert();
        default:
          return { data: null, error: { message: `Unknown operation: ${this._operation}` } };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code;
      return { data: null, error: { message, code } };
    }
  }

  private async _executeSelect(): Promise<QueryResult<T>> {
    const params: unknown[] = [];
    let paramIdx = 1;

    // SELECT 절 (임베디드 관계 포함)
    let selectClause: string;
    if (this._embeddedRelations.length > 0) {
      const parts: string[] = [];
      // 기본 컬럼
      if (this._baseColumns.length === 0 || this._baseColumns.includes("*")) {
        parts.push(`"${this._table}".*`);
      } else {
        parts.push(...this._baseColumns.map((c) => `"${this._table}".${this._quoteCol(c)}`));
      }
      // 임베디드 관계 서브쿼리
      for (const rel of this._embeddedRelations) {
        const targetCols = rel.targetColumns.includes("*")
          ? `to_json("${rel.targetTable}".*)`
          : `json_build_object(${rel.targetColumns.map((c) => `'${c}', "${rel.targetTable}".${this._quoteCol(c)}`).join(", ")})`;
        parts.push(
          `(SELECT ${targetCols} FROM "${rel.targetTable}" WHERE "${rel.targetTable}"."id" = "${this._table}".${this._quoteCol(rel.sourceColumn)} LIMIT 1) AS "${rel.alias}"`,
        );
      }
      selectClause = parts.join(", ");
    } else {
      selectClause = this._selectColumns === "*" ? "*" : this._selectColumns;
    }

    // COUNT only (head mode)
    if (this._head && this._count) {
      const { whereClause, whereParams } = this._buildWhere(paramIdx);
      params.push(...whereParams);
      const sql = `SELECT COUNT(*) as count FROM "${this._table}"${whereClause}`;
      const result = await this.pool.query(sql, params);
      return { data: null, error: null, count: parseInt(result.rows[0].count) };
    }

    // 일반 SELECT
    const { whereClause, whereParams } = this._buildWhere(paramIdx);
    params.push(...whereParams);
    paramIdx += whereParams.length;

    const orderClause = this._buildOrder();
    const limitClause = this._limitVal !== null ? ` LIMIT ${this._limitVal}` : "";
    const offsetClause = this._offsetVal !== null ? ` OFFSET ${this._offsetVal}` : "";

    let sql = `SELECT ${selectClause} FROM "${this._table}"${whereClause}${orderClause}${limitClause}${offsetClause}`;

    // count 포함 시 별도 카운트 쿼리
    let count: number | null = null;
    if (this._count === "exact") {
      const { whereClause: cWhere, whereParams: cParams } = this._buildWhere(1);
      const countSql = `SELECT COUNT(*) as count FROM "${this._table}"${cWhere}`;
      const countResult = await this.pool.query(countSql, cParams);
      count = parseInt(countResult.rows[0].count);
    }

    const result = await this.pool.query(sql, params);

    if (this._single) {
      if (result.rows.length === 0) {
        return { data: null, error: { message: "Row not found", code: "PGRST116" }, count };
      }
      return { data: result.rows[0] as T, error: null, count };
    }

    if (this._maybeSingle) {
      return { data: (result.rows[0] || null) as T, error: null, count };
    }

    return { data: result.rows as T[], error: null, count };
  }

  private async _executeInsert(): Promise<QueryResult<T>> {
    if (!this._data) return { data: null, error: { message: "No data provided for insert" } };

    const rows = Array.isArray(this._data) ? this._data : [this._data];
    if (rows.length === 0) return { data: [], error: null };

    const columns = Object.keys(rows[0]);
    const params: unknown[] = [];
    let paramIdx = 1;

    const valueRows: string[] = [];
    for (const row of rows) {
      const valueParts: string[] = [];
      for (const col of columns) {
        const val = row[col];
        if (val !== undefined && val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
          valueParts.push(`$${paramIdx++}::jsonb`);
          params.push(JSON.stringify(val));
        } else if (Array.isArray(val)) {
          valueParts.push(`$${paramIdx++}::jsonb`);
          params.push(JSON.stringify(val));
        } else {
          valueParts.push(`$${paramIdx++}`);
          params.push(val);
        }
      }
      valueRows.push(`(${valueParts.join(", ")})`);
    }

    const colList = columns.map((c) => this._quoteCol(c)).join(", ");
    const returning = this._returning ? ` RETURNING ${this._selectColumns === "*" ? "*" : this._selectColumns}` : " RETURNING *";
    const sql = `INSERT INTO "${this._table}" (${colList}) VALUES ${valueRows.join(", ")}${returning}`;

    const result = await this.pool.query(sql, params);

    if (this._single) {
      return { data: (result.rows[0] || null) as T, error: null };
    }

    return { data: (Array.isArray(this._data) ? result.rows : result.rows[0] || null) as T, error: null };
  }

  private async _executeUpdate(): Promise<QueryResult<T>> {
    if (!this._data) return { data: null, error: { message: "No data provided for update" } };

    const params: unknown[] = [];
    let paramIdx = 1;
    const setParts: string[] = [];

    for (const [col, val] of Object.entries(this._data as Record<string, unknown>)) {
      if (val !== undefined && val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
        setParts.push(`${this._quoteCol(col)} = $${paramIdx++}::jsonb`);
        params.push(JSON.stringify(val));
      } else if (Array.isArray(val)) {
        setParts.push(`${this._quoteCol(col)} = $${paramIdx++}::jsonb`);
        params.push(JSON.stringify(val));
      } else {
        setParts.push(`${this._quoteCol(col)} = $${paramIdx++}`);
        params.push(val);
      }
    }

    const { whereClause, whereParams } = this._buildWhere(paramIdx);
    params.push(...whereParams);

    const returning = this._returning ? ` RETURNING ${this._selectColumns}` : " RETURNING *";
    const sql = `UPDATE "${this._table}" SET ${setParts.join(", ")}${whereClause}${returning}`;

    const result = await this.pool.query(sql, params);

    if (this._single) {
      return { data: (result.rows[0] || null) as T, error: null };
    }

    return { data: result.rows as T[], error: null };
  }

  private async _executeDelete(): Promise<QueryResult<T>> {
    const params: unknown[] = [];
    const { whereClause, whereParams } = this._buildWhere(1);
    params.push(...whereParams);

    const sql = `DELETE FROM "${this._table}"${whereClause}`;
    await this.pool.query(sql, params);

    return { data: null, error: null };
  }

  private async _executeUpsert(): Promise<QueryResult<T>> {
    if (!this._data) return { data: null, error: { message: "No data provided for upsert" } };

    const rows = Array.isArray(this._data) ? this._data : [this._data];
    if (rows.length === 0) return { data: [], error: null };

    const columns = Object.keys(rows[0]);
    const params: unknown[] = [];
    let paramIdx = 1;

    const valueRows: string[] = [];
    for (const row of rows) {
      const valueParts: string[] = [];
      for (const col of columns) {
        const val = row[col];
        if (val !== undefined && val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
          valueParts.push(`$${paramIdx++}::jsonb`);
          params.push(JSON.stringify(val));
        } else if (Array.isArray(val)) {
          valueParts.push(`$${paramIdx++}::jsonb`);
          params.push(JSON.stringify(val));
        } else {
          valueParts.push(`$${paramIdx++}`);
          params.push(val);
        }
      }
      valueRows.push(`(${valueParts.join(", ")})`);
    }

    const colList = columns.map((c) => this._quoteCol(c)).join(", ");
    const conflictCol = this._onConflict || "id";
    const updateCols = columns
      .filter((c) => c !== conflictCol)
      .map((c) => `${this._quoteCol(c)} = EXCLUDED.${this._quoteCol(c)}`)
      .join(", ");

    const returning = " RETURNING *";
    const sql = `INSERT INTO "${this._table}" (${colList}) VALUES ${valueRows.join(", ")} ON CONFLICT (${this._quoteCol(conflictCol)}) DO UPDATE SET ${updateCols}${returning}`;

    const result = await this.pool.query(sql, params);

    if (this._single) {
      return { data: (result.rows[0] || null) as T, error: null };
    }

    return { data: result.rows as T[], error: null };
  }

  // ─── WHERE 절 빌드 ───

  private _buildWhere(startIdx: number): { whereClause: string; whereParams: unknown[] } {
    if (this._filters.length === 0) return { whereClause: "", whereParams: [] };

    const parts: string[] = [];
    const params: unknown[] = [];
    let idx = startIdx;

    for (const f of this._filters) {
      switch (f.type) {
        case "eq":
          if (f.value === null) {
            parts.push(`${this._quoteCol(f.column!)} IS NULL`);
          } else {
            parts.push(`${this._quoteCol(f.column!)} = $${idx++}`);
            params.push(f.value);
          }
          break;
        case "neq":
          if (f.value === null) {
            parts.push(`${this._quoteCol(f.column!)} IS NOT NULL`);
          } else {
            parts.push(`${this._quoteCol(f.column!)} != $${idx++}`);
            params.push(f.value);
          }
          break;
        case "gt":
          parts.push(`${this._quoteCol(f.column!)} > $${idx++}`);
          params.push(f.value);
          break;
        case "gte":
          parts.push(`${this._quoteCol(f.column!)} >= $${idx++}`);
          params.push(f.value);
          break;
        case "lt":
          parts.push(`${this._quoteCol(f.column!)} < $${idx++}`);
          params.push(f.value);
          break;
        case "lte":
          parts.push(`${this._quoteCol(f.column!)} <= $${idx++}`);
          params.push(f.value);
          break;
        case "in": {
          const vals = f.value as unknown[];
          if (vals.length === 0) {
            parts.push("FALSE");
          } else {
            const placeholders = vals.map(() => `$${idx++}`).join(", ");
            parts.push(`${this._quoteCol(f.column!)} IN (${placeholders})`);
            params.push(...vals);
          }
          break;
        }
        case "is":
          if (f.value === null) {
            parts.push(`${this._quoteCol(f.column!)} IS NULL`);
          } else if (f.value === true) {
            parts.push(`${this._quoteCol(f.column!)} IS TRUE`);
          } else if (f.value === false) {
            parts.push(`${this._quoteCol(f.column!)} IS FALSE`);
          }
          break;
        case "ilike":
          parts.push(`${this._quoteCol(f.column!)} ILIKE $${idx++}`);
          params.push(f.value);
          break;
        case "like":
          parts.push(`${this._quoteCol(f.column!)} LIKE $${idx++}`);
          params.push(f.value);
          break;
        case "not":
          if (f.operator === "is" && f.value === null) {
            parts.push(`${this._quoteCol(f.column!)} IS NOT NULL`);
          } else if (f.operator === "in") {
            // .not("source_type", "in", '("crawl","youtube")') → NOT IN
            const inVals = this._parseNotInValue(f.value as string);
            if (inVals.length > 0) {
              const placeholders = inVals.map(() => `$${idx++}`).join(", ");
              parts.push(`${this._quoteCol(f.column!)} NOT IN (${placeholders})`);
              params.push(...inVals);
            }
          } else if (f.operator === "eq") {
            parts.push(`${this._quoteCol(f.column!)} != $${idx++}`);
            params.push(f.value);
          }
          break;
        case "or": {
          const orParsed = this._parseOrString(f.orString!, idx, params);
          if (orParsed.sql) {
            parts.push(`(${orParsed.sql})`);
            idx = orParsed.nextIdx;
          }
          break;
        }
        case "contains":
          parts.push(`${this._quoteCol(f.column!)} @> $${idx++}::jsonb`);
          params.push(JSON.stringify(f.value));
          break;
        case "overlaps":
          parts.push(`${this._quoteCol(f.column!)} && $${idx++}`);
          params.push(f.value);
          break;
        case "textSearch":
          parts.push(`to_tsvector(${this._quoteCol(f.column!)}) @@ plainto_tsquery($${idx++})`);
          params.push(f.value);
          break;
      }
    }

    return {
      whereClause: parts.length > 0 ? ` WHERE ${parts.join(" AND ")}` : "",
      whereParams: params,
    };
  }

  // ─── ORDER BY 빌드 ───

  private _buildOrder(): string {
    if (this._orders.length === 0) return "";
    const parts = this._orders.map((o) => {
      let s = `${this._quoteCol(o.column)} ${o.ascending ? "ASC" : "DESC"}`;
      if (o.nullsFirst !== undefined) {
        s += o.nullsFirst ? " NULLS FIRST" : " NULLS LAST";
      }
      return s;
    });
    return ` ORDER BY ${parts.join(", ")}`;
  }

  // ─── SELECT 컬럼 파싱 (임베디드 관계 포함) ───

  private _parseSelectColumns(columns: string): void {
    // PostgREST 임베딩 패턴: alias:table!fk_name(cols)
    const embedRegex = /(\w+):(\w+)!(\w+)\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    let cleanColumns = columns;

    while ((match = embedRegex.exec(columns)) !== null) {
      const [fullMatch, alias, targetTable, fkName, targetCols] = match;
      // FK 이름에서 source column 추출: reviews_author_id_fkey → author_id
      const sourceColumn = this._extractSourceColumn(fkName, this._table);
      this._embeddedRelations.push({
        alias,
        targetTable,
        sourceColumn,
        targetColumns: targetCols.split(",").map((c) => c.trim()),
        isArray: false,
      });
      cleanColumns = cleanColumns.replace(fullMatch, "").replace(/,\s*,/g, ",").replace(/^,\s*|,\s*$/g, "");
    }

    // 기본 컬럼
    cleanColumns = cleanColumns.trim();
    if (cleanColumns) {
      this._baseColumns = cleanColumns.split(",").map((c) => c.trim()).filter(Boolean);
    }

    if (this._embeddedRelations.length === 0) {
      this._selectColumns = columns;
    }
  }

  // ─── FK 이름에서 소스 컬럼 추출 ───

  private _extractSourceColumn(fkName: string, table: string): string {
    // 패턴: {table}_{column}_fkey → column 추출
    const prefix = `${table}_`;
    const suffix = "_fkey";
    if (fkName.startsWith(prefix) && fkName.endsWith(suffix)) {
      return fkName.slice(prefix.length, -suffix.length);
    }
    // 대체: fk 이름에서 테이블 이름 제거 후 _fkey 제거
    return fkName.replace(/_fkey$/, "").replace(new RegExp(`^${table}_`), "");
  }

  // ─── OR 문자열 파싱 (PostgREST 형식) ───

  private _parseOrString(
    orStr: string,
    startIdx: number,
    params: unknown[],
  ): { sql: string; nextIdx: number } {
    // PostgREST or 형식: "col1.op.val1,col2.op.val2"
    // 예: "title.ilike.%search%,body_md.ilike.%search%"
    // 예: "embedding.is.null,text_embedding.is.null"
    // 예: "last_crawled_at.is.null,last_crawled_at.lt.2026-03-16"
    const parts: string[] = [];
    let idx = startIdx;

    // 쉼표로 분리 (주의: 값에 쉼표가 있을 수 있음)
    const conditions = this._splitOrConditions(orStr);

    for (const cond of conditions) {
      const dotIdx1 = cond.indexOf(".");
      if (dotIdx1 === -1) continue;
      const col = cond.slice(0, dotIdx1);
      const rest = cond.slice(dotIdx1 + 1);
      const dotIdx2 = rest.indexOf(".");
      if (dotIdx2 === -1) continue;
      const op = rest.slice(0, dotIdx2);
      const val = rest.slice(dotIdx2 + 1);

      switch (op) {
        case "eq":
          parts.push(`${this._quoteCol(col)} = $${idx++}`);
          params.push(val);
          break;
        case "neq":
          parts.push(`${this._quoteCol(col)} != $${idx++}`);
          params.push(val);
          break;
        case "gt":
          parts.push(`${this._quoteCol(col)} > $${idx++}`);
          params.push(val);
          break;
        case "gte":
          parts.push(`${this._quoteCol(col)} >= $${idx++}`);
          params.push(val);
          break;
        case "lt":
          parts.push(`${this._quoteCol(col)} < $${idx++}`);
          params.push(val);
          break;
        case "lte":
          parts.push(`${this._quoteCol(col)} <= $${idx++}`);
          params.push(val);
          break;
        case "ilike":
          parts.push(`${this._quoteCol(col)} ILIKE $${idx++}`);
          params.push(val);
          break;
        case "like":
          parts.push(`${this._quoteCol(col)} LIKE $${idx++}`);
          params.push(val);
          break;
        case "is":
          if (val === "null") {
            parts.push(`${this._quoteCol(col)} IS NULL`);
          } else if (val === "true") {
            parts.push(`${this._quoteCol(col)} IS TRUE`);
          } else if (val === "false") {
            parts.push(`${this._quoteCol(col)} IS FALSE`);
          }
          break;
        case "in": {
          const inVals = val.replace(/^\(|\)$/g, "").split(",");
          const placeholders = inVals.map(() => `$${idx++}`).join(", ");
          parts.push(`${this._quoteCol(col)} IN (${placeholders})`);
          params.push(...inVals);
          break;
        }
        default:
          parts.push(`${this._quoteCol(col)} ${op} $${idx++}`);
          params.push(val);
      }
    }

    return { sql: parts.join(" OR "), nextIdx: idx };
  }

  private _splitOrConditions(orStr: string): string[] {
    // 간단한 쉼표 분리 — 괄호 안의 쉼표는 무시
    const result: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of orStr) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        result.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) result.push(current.trim());
    return result;
  }

  // ─── .not("source_type", "in", '("crawl","youtube")') 파싱 ───

  private _parseNotInValue(val: string): string[] {
    // '("crawl","youtube","blueprint","lecture")' → ["crawl", "youtube", ...]
    return val.replace(/^\(|\)$/g, "").split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
  }

  // ─── 컬럼 이름 인용 (예약어 보호) ───

  private _quoteCol(col: string): string {
    // 이미 인용된 경우 그대로
    if (col.startsWith('"')) return col;
    // order, limit 등 예약어는 인용
    const reserved = new Set(["order", "limit", "offset", "user", "group", "table", "column", "index", "check", "primary", "key", "default", "constraint", "references", "type", "role", "name"]);
    if (reserved.has(col.toLowerCase())) return `"${col}"`;
    return col;
  }
}

// ─── RPC 호출 ───

export class PostgresRpcBuilder<T = Record<string, unknown>> {
  private pool: Pool;
  private funcName: string;
  private params: Record<string, unknown>;

  constructor(pool: Pool, funcName: string, params: Record<string, unknown> = {}) {
    this.pool = pool;
    this.funcName = funcName;
    this.params = params;
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    resolve?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this._execute().then(resolve, reject);
  }

  private async _execute(): Promise<QueryResult<T>> {
    try {
      const paramNames = Object.keys(this.params);
      const paramValues = Object.values(this.params);
      const placeholders = paramNames.map((name, i) => `${name} := $${i + 1}`).join(", ");
      const sql = `SELECT * FROM ${this.funcName}(${placeholders})`;
      const result = await this.pool.query(sql, paramValues);
      return { data: result.rows as T[], error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message } };
    }
  }
}
