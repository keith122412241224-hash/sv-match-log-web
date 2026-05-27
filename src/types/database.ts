export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type DeckType = "my_deck" | "opponent_deck";
export type TurnOrder = "first" | "second";
export type MatchResult = "win" | "lose";
export type SuggestionStatus = "pending" | "approved" | "rejected";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          email?: string;
          display_name?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      environments: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          start_date: string | null;
          memo: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          start_date?: string | null;
          memo?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          start_date?: string | null;
          memo?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_users: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      deck_archetypes: {
        Row: {
          id: string;
          class_name: string;
          name: string;
          environment_id: string | null;
          environment_name: string | null;
          is_active: boolean;
          is_other: boolean;
          sort_order: number;
          memo: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          class_name: string;
          name: string;
          environment_id?: string | null;
          environment_name?: string | null;
          is_active?: boolean;
          is_other?: boolean;
          sort_order?: number;
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          class_name?: string;
          name?: string;
          environment_id?: string | null;
          environment_name?: string | null;
          is_active?: boolean;
          is_other?: boolean;
          sort_order?: number;
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      deck_aliases: {
        Row: {
          id: string;
          archetype_id: string;
          alias_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          archetype_id: string;
          alias_name: string;
          created_at?: string;
        };
        Update: {
          archetype_id?: string;
          alias_name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      user_decks: {
        Row: {
          id: string;
          user_id: string;
          archetype_id: string;
          custom_name: string | null;
          memo: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          archetype_id: string;
          custom_name?: string | null;
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          archetype_id?: string;
          custom_name?: string | null;
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      deck_suggestions: {
        Row: {
          id: string;
          user_id: string;
          class_name: string;
          suggested_name: string;
          memo: string | null;
          status: SuggestionStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          class_name: string;
          suggested_name: string;
          memo?: string | null;
          status?: SuggestionStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          class_name?: string;
          suggested_name?: string;
          memo?: string | null;
          status?: SuggestionStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      decks: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          class_name: string;
          deck_type: DeckType;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          class_name: string;
          deck_type: DeckType;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          name?: string;
          class_name?: string;
          deck_type?: DeckType;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          user_id: string;
          environment_id: string | null;
          my_deck_id: string;
          opponent_deck_id: string;
          my_user_deck_id: string | null;
          my_archetype_id: string | null;
          opponent_archetype_id: string | null;
          turn_order: TurnOrder;
          result: MatchResult;
          played_at: string;
          memo: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          environment_id?: string | null;
          my_deck_id: string;
          opponent_deck_id: string;
          my_user_deck_id?: string | null;
          my_archetype_id?: string | null;
          opponent_archetype_id?: string | null;
          turn_order: TurnOrder;
          result: MatchResult;
          played_at?: string;
          memo?: string | null;
          created_at?: string;
        };
        Update: {
          environment_id?: string | null;
          my_deck_id?: string;
          opponent_deck_id?: string;
          my_user_deck_id?: string | null;
          my_archetype_id?: string | null;
          opponent_archetype_id?: string | null;
          turn_order?: TurnOrder;
          result?: MatchResult;
          played_at?: string;
          memo?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "matches_environment_id_fkey";
            columns: ["environment_id"];
            isOneToOne: false;
            referencedRelation: "environments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_my_deck_id_fkey";
            columns: ["my_deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_opponent_deck_id_fkey";
            columns: ["opponent_deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      deck_type: DeckType;
      turn_order: TurnOrder;
      match_result: MatchResult;
      suggestion_status: SuggestionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Deck = Database["public"]["Tables"]["decks"]["Row"];
export type Match = Database["public"]["Tables"]["matches"]["Row"];
export type Environment = Database["public"]["Tables"]["environments"]["Row"];
export type AdminUser = Database["public"]["Tables"]["admin_users"]["Row"];
export type DeckArchetype = Database["public"]["Tables"]["deck_archetypes"]["Row"];
export type DeckAlias = Database["public"]["Tables"]["deck_aliases"]["Row"];
export type UserDeck = Database["public"]["Tables"]["user_decks"]["Row"];
export type DeckSuggestion = Database["public"]["Tables"]["deck_suggestions"]["Row"];
