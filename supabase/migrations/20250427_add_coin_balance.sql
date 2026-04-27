-- Add coin_balance column to profiles table
ALTER TABLE profiles ADD COLUMN coin_balance BIGINT DEFAULT 0;
